

class Map {
    /**
     * Creates a new map with the given
     */
    constructor(entities, variable, params, session) {
        this.entities = entities;
        this.entityIDs = entities.map(_.property('id'));
        this.variable = variable;
        this.sessionID = session.session_id;
        this.initialBounds = session.bounds;
        this.summaryStats = session.summary_statistics;

        // This should not be required by the map.
        // Only for mapping variables to ODN links.
        this.params = params;

        // Mapping from entity ID to highest quality GeoJSON feature
        // that we currenty have. This is the feature that will be displayed.
        this.features = {};

        // Current entity popup.
        this.popup = null;

        this.scaleRange = MapConstants.COLOR_SCALE;
        this.scale = getScale(this.summaryStats, this.scaleRange);
    }

    static create(entities, variable, constraints, params) {
        return newSession(entities, variable, constraints).then(session => {
            return Promise.resolve(new Map(entities, variable, params, session));
        });
    }

    /**
     * Shows the map on the given div.
     */
    show(selector) {
        const isMobile = d3.select('body').node().getBoundingClientRect().width < 800;
        const container = d3.select(selector)
            .append('div')
            .attr('class', isMobile ? 'map-container map-container-collapsed' : 'map-container map-container-expanded')
            .attr('id', MapConstants.CSS_ID);

        const map = L.map(MapConstants.CSS_ID, MapConstants.MAP_OPTIONS);
        this.map = map;

        map.fitBounds(this.initialBounds);

/*
        if (d3.select('body').node().getBoundingClientRect().width <= 800)
            map.addControl(this.expandCollapseControl);
        */

        map.whenReady(() => {
            this.showZoom();
            this.showLegend();

            this.showTileLayers();
        });

        openSocket(MapConstants.MAP_VALUES_WS_URL).then(socket => {
            this.socket = socket;

            this.requestUpdate();
            map.on('moveend', () => this.requestUpdate());

            socket.onmessage = message => {
                this.handleUpdate(JSON.parse(message.data));
            };
        });

    }

    showTileLayers() {
        const url = layerID => `https://api.mapbox.com/v4/${layerID}/{z}/{x}/{y}.png?access_token=${MapConstants.MAPBOX_TOKEN}`;

        const base = L.tileLayer(url(MapConstants.BASE_LAYER_ID)).addTo(this.map);
        const pane = this.map.createPane('labels');
        const labels = L.tileLayer(url(MapConstants.LABEL_LAYER_ID), {pane}).addTo(this.map);
    }

    showZoom() {
        if (MapConstants.ZOOM_CONTROL) {
            this.zoomControl = new L.Control.Zoom(MapConstants.ZOOM_CONTROL_OPTIONS);
            this.map.addControl(this.zoomControl);
        }
    }

    showLegend() {
        this.legend = new LegendControl();
        this.map.addControl(this.legend);
        this.legend.update(this.summaryStats, this.scaleRange);
    }

    showInitialPopup(feature) {
        this.getPopup(feature).addTo(this.map);
    }

    showPopup(feature) {
        this.hidePopup();
        this.popup = this.getPopup(feature);
        this.popup.addTo(this.map);
    }

    getPopup(feature) {
        return L.popup(MapConstants.POPUP_OPTIONS)
            .setLatLng(getCenter(feature))
            .setContent(this.getPopupContent(feature));
    }

    getPopupContent(feature) {
        const entity = feature.feature.properties;

        return `
            <div>
                <div class="name">${entity.name}</div>
                <div class="value">${this.variable.name}: ${entity.value_formatted}</div>
                <div class="tooltip-controls">
                    ${this.getCompareHTML(entity)}
                    ${this.getNavigateHTML(entity)}
                </div>
            </div>
        `;
    }

    getCompareHTML(entity) {
        if (_.includes(this.entityIDs, entity.id)) return '';

        return `
            <a href="${this.getCompareURL(entity)}">
                <i class="fa fa-plus"></i>
                <span>Compare</span>
            </a>
        `;
    }

    // Link to compare the given entity to the selected entities.
    getCompareURL(entity) {
        const entities = this.entities.concat([entity]);
        const ids = entities.map(_.property('id')).join('-');
        const names = entities.map(_.property('name')).map(escapeName).join('-');

        return `/region/${ids}/${names}/${this.getParamsURL()}`;
    }

    getNavigateHTML(entity) {
        if (this.entityIDs.length === 1 && _.includes(this.entityIDs, entity.id)) return '';

        return `
            <a href="${this.getEntityURL(entity)}">
                <i class="fa fa-location-arrow"></i>
                <span>Go To</span>
            </a>
        `;
    }

    getEntityURL(entity) {
        const id = entity.id;
        const name = escapeName(entity.name);

        return `/region/${id}/${name}/${this.getParamsURL()}`;
    }

    getParamsURL() {
        return ['vector', 'metric', 'year']
            .map(_.propertyOf(this.params))
            .join('/');
    }

    hidePopup() {
        console.log(this.popup);
        if (this.popup) this.map.closePopup(this.popup);
    }

    handleUpdate(message) {
        if (message.type === 'error')
            return console.error(message);

        const geojson = message.geojson;
        const zoomLevel = message.message.zoom_level;

        L.geoJson(geojson, {
            style: feature => this.styleFeature(feature),
            onEachFeature: (properties, feature) => this.addFeature(feature, zoomLevel)
        });
    }

    styleFeature(feature) {
        const fill = {fillColor: this.scale(feature.properties.value)};
        const base = MapConstants.BASE_STYLE;
        const selected = this.isSelected(feature) ? MapConstants.SELECTED_STYLE : {};

        return _.assign(fill, base, selected);
    }

    isSelected(feature) {
        return _.includes(this.entityIDs, feature.properties.id);
    }

    /**
     * Adds the feature if it is the highest quality feature available.
     */
    addFeature(feature, zoomLevel) {
        const id = feature.feature.properties.id;

        if (id in this.features && this.features[id]._zoomLevel > zoomLevel) return;
        if (id in this.features) this.map.removeLayer(this.features[id]);

        feature._id = id;
        feature._zoomLevel = zoomLevel;
        feature.on('click', () => this.showPopup(feature));
        if (this.isSelected(feature.feature)) this.showInitialPopup(feature);

        this.features[id] = feature;
        this.map.addLayer(feature);
    }



    requestUpdate() {
        this.socket.send(this.getUpdateMessage());
    }

    getUpdateMessage() {
        const message = {
            bounds: this.getBounds(),
            zoom_level: this.map.getZoom(),
            session_id: this.sessionID
        };

        return JSON.stringify(message);
    }

    getBounds() {
        const mapBounds = this.map.getBounds();
        const nw = mapBounds.getNorthWest();
        const se = mapBounds.getSouthEast();
        const bounds = [boundLat(nw.lat), boundLng(nw.lng), boundLat(se.lat), boundLng(se.lng)];
        return bounds;
    }
}

function get(path, params) {
    const url = `${path}?${$.param(params)}`;
    return d3.promise.json(url);
}

function newSession(entities, variable, constraints) {
    return get(MapConstants.MAP_NEW_URL, _.assign({
        variable: variable.id,
        entity_id: entities.map(_.property('id')).join(','),
        app_token: MapConstants.APP_TOKEN
    }, constraints));
}

function openSocket(url) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url);

        socket.onopen = () => {
            resolve(socket);
        };
    });
}

function bound(max) {
    return value => value > max ? max : (value < -max ? -max : value);
}

const boundLat = bound(90);
const boundLng = bound(180);

function getScale(stats, range) {
    return d3.scaleQuantize()
        .domain([stats.minimum, stats.average, stats.maximum])
        .range(range);
}

function getCenter(feature) {
    if (feature.getLatLng) {
        return feature.getLatLng();
    } else {
        const latlngs = feature.getLatLngs();
        const bounds = L.latLngBounds(_.flatten(latlngs));
        return bounds.getCenter();
    }
}

function escapeName(string) {
    return string
        .replace(/,/g, '')
        .replace(/[ \/]/g, '_');
}

const entities = [
    {
        id: '310M200US42660',
        name: 'Seattle Metro Area (WA)',
        type: 'region.msa'
    }
];

