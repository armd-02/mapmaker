// Global Variable
var map;				// leaflet map object
var Layers = {};		// Layer Status,geojson,svglayer
var Conf = {};			// Config Praams
const LANG = document.documentElement.lang.toLowerCase() === "en" ? "en" : "ja";
const glot = new Glottologist();
glot.locale(LANG);

// initialize class object
const poiCont = new poiControl();
const Marker = new MarkerControl();
const LayerCont = new LayerControl();
const SVGCont = new SVGControl();
const overPassCont = new OverPassControl();
const CoastLine = new GeoCoastline();
const GeoCont = new GeoControl();

// initialize MapMaker
class initialize {
    static initDailyIntro() {
        const intro = document.getElementById("mapMakerIntro");
        const closeButton = document.getElementById("mapMakerIntroClose");
        if (!intro || !closeButton) return;

        const introConfig = Conf?.intro ?? {};
        if (introConfig.use === false) {
            intro.hidden = true;
            return;
        }

        const now = new Date();
        const today = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, "0"),
            String(now.getDate()).padStart(2, "0")
        ].join("-");
        const storageKey = introConfig.storageKey || "mapmaker-intro-last-shown";

        try {
            if (window.localStorage.getItem(storageKey) === today) {
                intro.hidden = true;
                return;
            }
        } catch (error) {
            console.info("MapMaker: Could not read the introduction history.", error);
        }

        const positionIntro = () => {
            const menu = document.getElementById("basemenu");
            const article = document.getElementById("article");
            if (!menu || !article) return;

            const menuRect = menu.getBoundingClientRect();
            const articleRect = article.getBoundingClientRect();
            if (window.matchMedia("(min-width: 992px)").matches) {
                intro.style.setProperty("--mapmaker-intro-top", "12px");
                intro.style.setProperty("--mapmaker-intro-left", `${Math.max(12, Math.ceil(menuRect.right - articleRect.left + 12))}px`);
            } else {
                intro.style.setProperty("--mapmaker-intro-top", `${Math.max(12, Math.ceil(menuRect.bottom - articleRect.top + 12))}px`);
                intro.style.setProperty("--mapmaker-intro-left", "12px");
            }
        };
        const resizeObserver = typeof ResizeObserver === "function"
            ? new ResizeObserver(positionIntro)
            : null;
        resizeObserver?.observe(document.getElementById("basemenu"));
        window.addEventListener("resize", positionIntro);
        const stopPositionTracking = () => {
            resizeObserver?.disconnect();
            window.removeEventListener("resize", positionIntro);
        };

        closeButton.setAttribute("aria-label", glot.get("intro_close"));
        positionIntro();
        intro.hidden = false;
        window.requestAnimationFrame(positionIntro);
        try {
            window.localStorage.setItem(storageKey, today);
        } catch (error) {
            console.info("MapMaker: Could not save the introduction history.", error);
        }

        const dismissIntro = () => {
            intro.hidden = true;
            stopPositionTracking();
        };
        closeButton.addEventListener("click", dismissIntro, { once: true });
        document.querySelector("#makeMap button")?.addEventListener("click", dismissIntro, { once: true });
    }

    static init() {
        window.addEventListener("DOMContentLoaded", function () {
            console.log("Welcome to MapMaker.");
            let jqXHRs = [];
            const FILES = [
                "./basemenu.html", "./modals.html", "./data/config-system.jsonc", "./data/config-user.jsonc",
                `./data/category-${LANG}.jsonc`, `./data/marker.jsonc`, './data/overpass-system.jsonc', "./data/leyers.jsonc",
                `./data/datatables-${LANG}.jsonc`, `./data/marker-addtional.jsonc`, `./data/prefecture.jsonc`, `./data/prefecture-all.jsonc`];
            for (let key in FILES) { jqXHRs.push($.get(FILES[key])) };
            $.when.apply($, jqXHRs).always(function () {
                let menuhtml = arguments[0][0];								// Get Menu HTML
                $("#modals").html(arguments[1][0]);							// Make Modal HTML
                for (let i = 2; i <= 11; i++) Conf = Object.assign(Conf, JSON5.parse(arguments[i][0]));	// Make Config Object
                Conf.category_keys = Object.keys(Conf.category); // Make Conf.category_keys

                glot.import("./data/glot.json").then(() => {	// Multi-language support
                    // document.title = glot.get("title");		// Title(no change / Google検索で日本語表示させたいので)
                    LayerCont.init();							// LayerCont Initialize
                    mapMaker.init(menuhtml);					// mapMaker Initialize
                    SVGCont.init();								// Marker Initialize
                    // Google Analytics
                    const analyticsHost = window.location.hostname;
                    if (Conf.default.GoogleAnalytics !== "") {
                        $('head').append('<script async src="https://www.googletagmanager.com/gtag/js?id=' + Conf.default.GoogleAnalytics + '"></script>');
                        window.dataLayer = window.dataLayer || [];
                        function gtag() { dataLayer.push(arguments); };
                        gtag('js', new Date());
                        const cookieDomain = Conf.default.GoogleAnalyticsCookieDomain || "";
                        const analyticsConfig = cookieDomain === analyticsHost
                            ? { cookie_domain: cookieDomain }
                            : {};
                        gtag('config', Conf.default.GoogleAnalytics, analyticsConfig);
                    };
                    glot.render();
                    initialize.initDailyIntro();
                });
            });
        });
    }
}

