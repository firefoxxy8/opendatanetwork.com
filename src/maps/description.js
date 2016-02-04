'use strict';

if (typeof require !== 'undefined') {
    var _ = require('lodash');

    var Navigate = require('../../controllers/navigate');
    var Requests = require('../../controllers/request');

    var MAP_SOURCES = require('../data/map-sources');
}

class MapSource {
    constructor(mapSource) {
        this.source = mapSource;
        this.variables = mapSource.variables;
        this.id = mapSource.idColumn || 'id';
        this.year = mapSource.yearColumn || 'year';
    }

    otherVariables(currentVariable) {
        return this.variables.filter(variable => variable.name !== currentVariable.name);
    }

    variables() {


    }

    getData(variable, year, regions) {
        const path = `https://${this.source.domain}/resource/${this.source.fxf}.json`;
        const columns = [this.id].concat(variable.column);
        const params = _.extend({
            '$select': columns.join(','),
            '$where': `${this.id} in (${regions.map(region => `'${region.id}'`)})`,
            [this.year]: year
        });

        if (typeof Requests === 'undefined') {
            const url = `${path}?${$.param(params)}`;
            return d3.promise.json(url);
        } else {
            const url = Requests.buildURL(path, params);
            return Requests.getJSON(url);
        }
    }

    summarize(variable, year, regions) {
        return new Promise((resolve, reject) => {
            this.getData(variable, year, regions).then(data => {
                const summary = regions.map(region => {
                    const row = _.find(data, row => row[this.id] === region.id);

                    const value = variable.format(row[variable.column]);
                    return `The ${variable.name.toLowerCase()} of ${region.name} in ${year} was ${value}.`;
                }).join(' ');

                resolve(summary);
            }, reject);
        });
    }

    getVariable(column) {
        const variable = _.find(this.variable, variable => variable.column === column);
        return variable ? variable : this.variables[0];
    }

    getYear(variable, year) {
        if (year && year !== '' && _.contains(variable.years, parseFloat(year))) return parseFloat(year);
        return _.max(variable.years);
    }
}

class MapDescription {
    static summarizeFromParams(params) {
        return new Promise((resolve, reject) => {
            if (params.vector && params.vector in MAP_SOURCES) {
                const source = new MapSource(MAP_SOURCES[params.vector]);
                const variable = source.getVariable(params.metric);
                const year = source.getYear(variable, params.year);
                const regions = params.regions;

                source.summarize(variable, year, regions).then(resolve, reject);
            } else {
                resolve('');
            }
        });
    }
}

if (typeof module !== 'undefined') module.exports = MapDescription;

