
$(document).ready(function() {

    // Mobile categories
    //
    $('.categories-dropdown-mobile').click(() => {

        if ($('.categories-list-mobile').is(':visible'))
            $('.categories-dropdown-mobile .fa').removeClass('fa-caret-up').addClass('fa-caret-down');
        else
            $('.categories-dropdown-mobile .fa').removeClass('fa-caret-down').addClass('fa-caret-up');

        $('.categories-list-mobile').slideToggle(100);
    });
    

    // Slider
    //
    $('.slider').slick({
        arrows: false,
        autoplay: true,
        autoplaySpeed: 2000,
        slidesToScroll: 1,
        slidesToShow: 5,
    });

    // Autocomplete
    //
    const headerAutoSuggest = multiComplete('#q', '.region-list');
    headerAutoSuggest.listen();

    const heroAutoSuggest = multiComplete('.home-search-bar-controls #q', '.home-search-bar-controls .region-list');
    heroAutoSuggest.listen();

    // QuickLinks
    //
    const quickLinks = new QuickLinks();

    quickLinks.onShow = () => {
        headerAutoSuggest.results.hide();
        heroAutoSuggest.results.hide();
    };

    // Search button
    //
    $('#search-button').click(() => {
        window.location.href = '/search?q=' + encodeURIComponent($('#q').val());
    });

    // Communities menu
    //
    $('#menu-item-communities').mouseenter(function() {

        $('#menu-communities').slideToggle(100);
        $('#menu-item-communities').addClass('selected');
    });

    $('#menu-item-communities').mouseleave(function() {

        $('#menu-communities').hide(100);
        $('#menu-item-communities').removeClass('selected');
    });

    // Locations by state
    //
    $('.more-subregions-link').click(function() {

       $(this).parent().removeClass('state-collapsed');
       $(this).hide();
    });

    $('.more-regions-link').click(function() {

       $('.states-list').removeClass('states-list-collapsed');
       $(this).hide();
    });
});
