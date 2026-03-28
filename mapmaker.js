/*	Main Process */
"use strict";

class MapMaker {
    constructor() {
        this.maps = []
        this.customMode = false
        this.initClearhtml
        this.viewLicense = false
        this.selectMode = ""
        this.copyrights = []
        this.colorPicker = []
    }
    // Initialize
    init(menuhtml) {
        MapCont.init();
        MapCont.controlAdd("bottomleft", "zoomlevel", "<div><.div>", "");
        mapMaker.makemenu(menuhtml);										// Make edit menu
        winCont.menulist_make();
        mapMaker.zoomMessage();																// Zoom 
        map.on('zoomend', () => mapMaker.zoomMessage());										// ズーム終了時に表示更新
        document.getElementById("search_input").placeholder = glot.get("address")			// set placeholder
        document.getElementById("search_input").previousElementSibling.innerHTML = glot.get("search")	// set button name
        document.getElementById("search_input").addEventListener('change', (e) => { mapMaker.searchPoi(e.target.value) });	// Address Search
    }

    // 基本メニューの作成 menuhtml:指定したHTMLで左上に作成 menuhtmlが空の時は過去のHTMLから復元
    makemenu(menuhtml) {
        console.log("Start: make menu.")
        document.getElementById("basemenu").innerHTML = menuhtml;

        console.log("Start: make marker.")
        let html = "", keys = Object.keys(Conf.osm);							// マーカー追加メニュー作成
        keys.forEach(key => {
            if (Conf.osm[key].marker !== undefined) {
                html += `<span class="dropdown-item btn ps-1 me-1" onclick="mapMaker.addPoi('${key}')">`;
                html += `<img class="me-1" src="./${Conf.osm[key].marker}" width="24px">`;
                html += `${glot.get("marker_" + key)}</span>\n`;
            };
        });
        document.getElementById("menu_list").innerHTML = html

        console.log("Start: make custom panel.")
        for (let panel of Conf.editPanels) {									    // editPanelsに基づいて編集パネルを作成
            // パネルタイトルの追加
            let title = glot.get(panel.groupGlot);
            let div = document.createElement("div");
            div.setAttribute("id", panel.groupGlot);
            div.className = "col ps-1 mt-1 fw-medium text-start border-0 border-bottom bg-light bg-gradient d-none";
            let span = document.createElement("span");
            span.innerHTML = title;
            div.appendChild(span);
            document.getElementById("customMap").appendChild(div);

            for (let key of panel.styles) {
                let key_layer = `#${key}_layer`;
                let key_line = `#${key}_line`;
                let copyobj = document.getElementById("AAA").cloneNode(true);
                copyobj.getElementsByClassName("customName")[0].innerHTML = glot.get("menu_" + key);
                copyobj.querySelector('#AAA_color').setAttribute('id', key + "_color");
                copyobj.querySelector('#AAA_line').setAttribute('value', Layers[key].width);
                copyobj.querySelector('#AAA_line').setAttribute('id', key + "_line");
                copyobj.querySelector('#AAA_layer').setAttribute('id', key + "_layer");
                if (key == "background") copyobj.querySelector(key_line).outerHTML = "<span class='input-hidden'></span>";
                copyobj.setAttribute('id', key);
                document.getElementById("customMap").appendChild(copyobj);

                // カラーピッカー追加
                this.colorPicker[key] = new Alwan(`#${key}_color`, {
                    preview: false, copy: false,
                    inputs: { hex: false, rgb: true, hsl: false }, color: Layers[key].color,
                    classname: "colorPalette", swatches: Conf.default.swatches
                });

                // 色変更時のイベント定義
                this.colorPicker[key].on('change', (ev) => {
                    Layers[key].color = ev.hex;
                    if (key_layer.indexOf("background") > -1) {
                        document.getElementById("mapid").style.backgroundColor = ev.hex;
                        document.getElementById("mapid").classList.remove("bg-clear");
                    };
                    $(`#${key}_color`).attr('value', ev.hex);
                    $(`#${key}_color`).removeClass('bg-clear');
                    Layers[key].opacity = 1;
                    Layers[key].color = ev.hex;
                    Layers[key].color_dark = chroma(ev.hex).darken(Conf.default.ColorDarken).hex();
                    if (document.getElementById(key + "_line") !== null) Layers[key].width = document.getElementById(key + "_line").value; //width;
                    LayerCont.updateLayer(key);
                });

                // 幅変更時のイベント定義
                $(key_line).on('change', (event) => {
                    Layers[key].width = event.target.value;; //width;
                    LayerCont.updateLayer(key);
                });
                // 表示変更時のイベント定義
                $(`#${key}_layer`).on('click', function () {
                    if (key_layer.indexOf("background") > -1) { // 地面の処理
                        $("#mapid").css('background-color', "");
                        $("#mapid").addClass("bg-clear");
                        $("#background_color").css('background-color', "");
                        $("#background_color").addClass("bg-clear");
                        Layers["background"].opacity = 0;
                    } else {    // その他レイヤの処理
                        let view = $(key_layer).children().attr("class").indexOf("fa-trash-alt") > 0 ? false : true;    // 現在の状態を判定
                        $(key_layer).children().toggleClass("fa-trash-alt fa-undo");
                        for (let eKey of LayerCont.styles) {
                            if (Layers[eKey].geojson) {
                                winCont.modal_text(`<br>Map Writeing... ${eKey}`, true);
                                LayerCont.makeLayer(eKey, eKey == key ? view : undefined);   // 指定したkeyレイヤーを作成
                            };
                        };
                    }
                });
            };
        };
        $("#AAA").remove();

        console.log("Start: make glot render.")
        glot.render();

        mapMaker.custom(false);	// カスタムモードOFF
        console.log("End: make menu.")
    }

    // 利用しているデータセットをCopyrightに反映
    addCopyright(text) { this.copyrights = [...new Set([...this.copyrights, text])] }

    // 利用しているデータセットをCopyright表示用に返す
    getCopyright() { return this.copyrights.length > 0 ? " | " + this.copyrights.join(' ') : "" }

    // Clear Menu
    clearMenu() {
        for (let key of LayerCont.styles) {
            this.colorPicker[key].setColor(Layers[key].color);
            if (key !== "background") {
                document.getElementById(`${key}_line`).value = Layers[key].width;
            }
        }
    }

    // About Street Map Maker's license
    licence(once) {
        if ((once == 'once' && this.viewLicense == false) || once == undefined) {
            let msg = { msg: glot.get("licence_message") + glot.get("more_message"), ttl: glot.get("licence_title") };
            winCont.modal_open({ "title": msg.ttl, "message": msg.msg, "mode": "close", callback_close: winCont.closeModal });
            this.viewLicense = true;
        };
    }

    // make custom map
    make(query_date) {
        let latlng = map.getCenter();
        while (latlng.lng >= 180) latlng.lng -= 360;
        while (latlng.lng <= -180) latlng.lng += 360;
        map.setView(latlng);    // 経度を-180～180に変換してからセット（OverpassAPIの仕様に合わせるため）
        let nowzoom = map.getZoom(), def_msg;
        if (nowzoom < Conf.default.MinZoomLevel) return false;
        if (typeof (query_date) == "undefined") query_date = "";
        def_msg = glot.get("loading_message");
        winCont.modal_open({ "title": glot.get("loading_title"), "message": def_msg, "mode": "" });
        winCont.spinner(true);

        // URL logging
        let href = location.href.replaceAll("#", "%23");
        Basic.getData('https://script.google.com/macros/s/AKfycbyuuTCJ4qPcSFCRmSlrhwlHDK8uFYUzSkF5EPoklOtShPadnyHT28P1gj8awGeWKyISGQ/exec?URL=' + href);

        var targets = [];
        var progress = function (data_length) {
            def_msg = "<br>Data Loading... " + Math.trunc(data_length / 1024).toLocaleString() + "KBytes."
            winCont.modal_text(def_msg, true)
        };
        for (let key of LayerCont.styles) if (Conf.style[LayerCont.palette][key].zoom <= nowzoom) targets.push(key);
        Basic.retry(() => overPassCont.get(targets, progress), 5).then((ovasnswer) => {
            winCont.modal_text("<br>Data Loading Complate... ", true);
            targets.forEach(target => {
                let tmpcnt = 0;
                console.log(`Start: process ${target} data.`)
                let geojson = overPassCont.get_target(ovasnswer, target);
                if (geojson.length > 0) {

                    // === 追加: 画面bboxで clip してから Layers に入れる ===
                    // bboxLonLat = [minLon, minLat, maxLon, maxLat]
                    const b = map.getBounds();
                    const bboxLonLat = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];

                    const clipFeatures = (featuresLike, bbox) => {
                        // turf が無い/使えないならそのまま返す
                        if (typeof turf === "undefined" || typeof turf.bboxClip !== "function") return featuresLike;

                        // --- 正規化：Feature配列へ ---
                        let features = featuresLike;

                        // FeatureCollection {type:"FeatureCollection", features:[...]}
                        if (features && features.type === "FeatureCollection" && Array.isArray(features.features)) {
                            features = features.features;
                        }
                        // 単一Feature
                        if (features && features.type === "Feature") {
                            features = [features];
                        }
                        // それ以外は配列でなければ空扱い（ここがエラー回避の肝）
                        if (!Array.isArray(features)) return [];

                        const out = [];
                        for (const f of features) {
                            if (!f?.geometry) continue;

                            const gt = f.geometry.type;

                            // Point系は bboxClip 対象外なので必要なら bounds 判定で落とす
                            if (gt === "Point") {
                                const c = f.geometry.coordinates; // [lon,lat]
                                if (c && c.length >= 2 &&
                                    c[0] >= bbox[0] && c[0] <= bbox[2] &&
                                    c[1] >= bbox[1] && c[1] <= bbox[3]) {
                                    out.push(f);
                                }
                                continue;
                            }
                            if (gt === "MultiPoint") {
                                out.push(f);
                                continue;
                            }

                            try {
                                const clipped = turf.bboxClip(f, bbox);
                                if (clipped?.geometry?.coordinates && clipped.geometry.coordinates.length) {
                                    out.push(clipped);
                                }
                            } catch (e) {
                                // 交差しない/不正形状は捨てる
                            }
                        }
                        return out;
                    };

                    // ============================================

                    let fil_geojson = { "features": geojson };

                    if (target == "sea") {
                        console.log(`Processing sea data...${tmpcnt++}`);
                        console.log("SEA RAW FEATURES", fil_geojson.features);

                        // coastline merge は広めの bbox で解析
                        fil_geojson.features = CoastLine.merge(fil_geojson.features, "LLL");

                        // 解析後に、実際の表示 bbox で切り戻す
                        fil_geojson.features = clipFeatures(fil_geojson.features, bboxLonLat);

                        console.log(fil_geojson);
                    } else {
                        // sea 以外も必要なら clip
                        // fil_geojson.features = clipFeatures(fil_geojson.features, bboxLonLat);
                    }

                    Layers[target].geojson = fil_geojson.features;
                };
            });
            for (let key of LayerCont.styles) {
                if (Layers[key].geojson) {
                    winCont.modal_text(`<br>Map Writeing... ${key}`, true);
                    LayerCont.makeLayer(key);   // 指定したkeyレイヤーを作成
                };
            };
            mapMaker.custom(true);
            winCont.closeModal().then(() => {
                console.log("mapMaker: make: end");
            })
        })/*.catch(() => {
				let modal = { "title": glot.get("sverror_title"), "message": glot.get("sverror_message"), "mode": "close", "callback_close": () => mapMaker.clearAll() };
				winCont.modal_open(modal);
			});*/
        return;
    }

    // Search Address(Japan Only)
    searchPoi(keyword) {
        const errorMsg = function () {
            winCont.modal_open({
                title: glot.get("addressnotfound_title"), message: glot.get("addressnotfound_body"),
                mode: "close", callback_close: () => { winCont.closeModal() }
            });
        }
        getLatLng(keyword, (latlng) => {
            console.log(latlng);
            if (latlng.level === 0) {                   // 見つからず
                errorMsg();
            } else if (latlng.level === 1) {            // 都道府県
                map.setZoom(Conf.default.SearchZoom - 6);
                map.panTo(Conf.prefecture[latlng.pref]);
            } else if (latlng.level === 2) {            // 市区町村
                const keys = Object.keys(Conf.allPrefecture)
                const values = Object.values(Conf.allPrefecture)
                const index = values.findIndex(value =>
                    value.prefecture === latlng.pref && (
                        value.city === latlng.city ||
                        latlng.city.endsWith(`郡${value.city}`) // 郡名が含まれていないため
                    )
                )
                const code = keys[index].substring(0, 5)
                const endpoint = `https://geolonia.github.io/japanese-admins/${code.substring(0, 2)}/${code}.json`
                fetch(endpoint).then(res => {
                    return res.json()
                }).then(data => {
                    const center = turf.centroid(data).geometry.coordinates;    // turfで中心を探す
                    map.setZoom(Conf.default.SearchZoom - 3);
                    map.panTo([center[1], center[0]]);
                })
            } else {                                    // 町名
                map.setZoom(Conf.default.SearchZoom);
                map.panTo(latlng);
            }
        }, e => {
            errorMsg();
        })
    }

    // 情報（アイコンなど）を地図に追加
    addPoi(key) {
        winCont.modal_open({ "title": glot.get("loading_title"), "message": glot.get("loading_message"), "mode": "" }).then(() => {
            winCont.spinner(true);
            if (Conf.osm[key].file !== undefined) {		// "file"がある場合(CSVなど)
                $.get(Conf.osm[key].file).then((csv) => {
                    let geojsons = GeoCont.csv2geojson(csv, key);
                    let targets = geojsons.map(() => [key]);
                    let copyright = Conf.osm[key].copyright;
                    mapMaker.addCopyright(copyright);
                    winCont.closeModal().then(() => {
                        poiset(key, { "geojson": geojsons, "targets": targets });
                    })
                });
            } else {
                Basic.retry(() => overPassCont.get([key]), 5).then((ovasnswer) => {
                    if (ovasnswer == undefined) {
                        let modal = {
                            "title": glot.get("nodata_title"), "message": glot.get("nodata_message"),
                            "mode": "close", "callback_close": () => winCont.closeModal()
                        };
                        winCont.modal_open(modal);
                    } else {
                        winCont.closeModal().then(() => {
                            poiset(key, ovasnswer);
                        })
                    };
                });
            };

            function poiset(key, answer) {
                let geojsons = { geojson: [], targets: [] };
                answer.geojson.forEach((geojson, idx) => {
                    let geo = geojson.geometry;
                    let cords; // = geo.coordinates;
                    cords = GeoCont.multi2flat(geo.coordinates, geo.type);	// ネスト構造のデータをフラット化
                    cords = GeoCont.flat2single(cords, geo.type);			// エリア/ライン => ポイント
                    cords = GeoCont.bboxclip([cords], true);				// 画面外のPOIは無視したgeojsonを作成
                    if (cords.length > 0) {
                        geojson.geometry.type = "Point";
                        if (cords[0][0] == NaN) console.log("NAN");
                        geojson.geometry.coordinates = cords[0];
                        geojsons.geojson.push(geojson);
                        geojsons.targets.push(answer.targets[idx]);
                    };
                });
                poiCont.addGeoJSON(geojsons);
                winCont.modal_select(key).then((slanswer) => {
                    poiCont.addGeoJSON(slanswer);
                    Marker.set(key);
                    winCont.closeModal().then(() => { console.log(`mapMaker: Add: ${key} end`) })
                }).catch(() => console.log("addPoi: cancel"));
            };
        })
    }

    // delete poi
    poi_del(target, osmid) {
        let poi = poiCont.get_osmid(osmid);
        if (poi !== undefined) {
            poi.enable = false;
            poiCont.setPoiData(poi);
            Marker.delete(target, osmid);
        };
    }

    // Image List and select
    poi_marker_change(target, osmid, filename) {
        switch (filename) {
            case "":
            case undefined:
                let html = "", images = [];
                Object.keys(Conf.marker.tag).forEach(key1 => {
                    Object.keys(Conf.marker.tag[key1]).forEach((key2) => {
                        let filename = Conf.marker.path + "/" + Conf.marker.tag[key1][key2];
                        filename = filename.indexOf(",") > 0 ? filename.split(",")[0] : filename;
                        if (images.indexOf(filename) == -1) { images.push(filename) };
                    });
                });
                Object.values(Conf.marker_append.files).forEach(key1 => {
                    let filename = Conf.marker_append.path + "/" + key1;
                    filename = filename.indexOf(",") > 0 ? filename.split(",")[0] : filename;
                    if (images.indexOf(filename) == -1) { images.push(filename) };
                });
                images = images.filter((x, i, self) => { return self.indexOf(x) === i });	//重複削除
                images.sort();
                Object.keys(images).forEach(fidx => { html += `<a href="#" onclick="mapMaker.poi_marker_change('${target}','${osmid}','${images[fidx]}')"><img class="iconx2" src="${images[fidx]}"></a>` });
                winCont.modal_open({ "title": "", "message": html, "mode": "close", callback_close: winCont.closeModal });
                break;
            default:
                Marker.change_icon(target, osmid, filename);
                winCont.closeModal();
                break;
        };
    }

    qr_add(target, osmid) {
        let marker = Marker.get(target, osmid);
        if (marker !== undefined) {
            let wiki = marker.mapmaker_lang.split(':');
            let url = encodeURI(`https://${wiki[0]}.${Conf.osm.wikipedia.domain}/wiki/${wiki[1]}`);
            let pix = map.latLngToLayerPoint(marker.getLatLng());
            let ll2 = map.layerPointToLatLng(pix);
            Basic.getWikipedia(wiki[0], wiki[1]).then(data => Marker.qr_add(target, osmid, url, ll2, data));
        };
    }

    // Show/Hide Custom Panel(mode change)
    custom(mode) {
        switch (mode) {
            case true:
                map.doubleClickZoom.disable();
                let palette = Conf.style[LayerCont.palette];
                for (let panel of Conf.editPanels) {									    // editPanelsに基づいて編集パネルを作成
                    let rems = false;
                    for (let key of panel.styles) {
                        let zoom = palette[key].zoom == undefined ? 0 : palette[key].zoom;
                        let disabled = zoom <= map.getZoom() ? "remove" : "add";
                        rems = rems || disabled == "remove";    // どれか一つでも表示可能なレイヤーがあればパネルを表示
                        document.getElementById(key).classList[disabled]("d-none");
                    }
                    if (rems) {
                        document.getElementById(panel.groupGlot).classList.remove("d-none");
                    } else {
                        document.getElementById(panel.groupGlot).classList.add("d-none");
                    }
                }
                customMap.classList.remove("d-none");          // Hide Custom Area
                makeMap.classList.add("d-none");            // Hide MakeMap button
                controlMenu.classList.remove("d-none");     // Show Control Menu
                saveMap.classList.remove("d-none");         // Show Save Button
                clearMap.classList.remove("d-none");           // Hide Clear Button
                ["dragging", "zoomControl", "scrollWheelZoom", "touchZoom"].forEach(key => map[key].disable());
                $("#search_input").attr('disabled', 'disabled');
                MapCont.stop();
                Object.keys(this.maps).forEach(key => { if (map.hasLayer(this.maps[key])) { Layers["MAP"] = this.maps[key]; map.removeLayer(this.maps[key]) } });	// remove select layer
                if (Layers.background.opacity === 0) {		// set background
                    $("#mapid").addClass("bg-clear");
                } else {
                    $("#mapid").removeClass("bg-clear");
                    $("#background_color").css('background-color', Layers.background.color);
                };
                this.customMode = mode;
                mapMaker.zoomMessage();
                break;
            case false:
                makeMap.classList.remove("d-none");         // Show MakeMap button
                controlMenu.classList.add("d-none");        // Hide Control Menu
                saveMap.classList.add("d-none");            // Hide Save Button
                clearMap.classList.add("d-none");           // Hide Clear Button
                customMap.classList.add("d-none");          // Hide Custom Area
                map.doubleClickZoom.enable();
                MapCont.start();
                ["dragging", "zoomControl", "scrollWheelZoom", "touchZoom"].forEach(key => map[key].enable());
                $("#search_input").attr('disabled', false);
                $("#mapid").removeClass("bg-clear");
                $("#background_color").css('background-color', "");
                this.customMode = mode;
                mapMaker.zoomMessage();
                this.copyrights = [];
                break;
        }
        return this.customMode;
    }

    // Area Select(A4)
    area_select(mode) {
        this.selectMode = mode;
        LayerCont.area_select(mode);
        return mode;
    }

    // save layers&pois
    save(type) {
        SVGCont.save({ type: type, mode: this.selectMode });
    }

    // View Zoom Level & Status Comment
    zoomMessage() {
        let nowzoom = map.getZoom();
        let message = `${glot.get("zoomlevel")}${map.getZoom()} `;
        if (nowzoom < Conf.default.MinZoomLevel) {
            message += `<br>${glot.get("morezoom")}`;
            makeMap.classList.add("d-none");
        } else {
            if (nowzoom < Conf.default.LimitZoomLevel) message += `<br>${glot.get("morezoom2")}`;
            if (!mapMaker.custom()) makeMap.classList.remove("d-none");
        };
        if (mapMaker.custom()) message += `<br>${glot.get("custommode")}`;
        $("#zoomlevel").html("<h2 class='zoom'>" + message + "</h2>");
    }

    // Try Again
    clearAll() {
        winCont.modal_open({
            title: glot.get("restart_title"),
            message: glot.get("restart_message"),
            mode: "yesno",
            callback_yes: () => {
                mapMaker.custom(false);
                overPassCont.clear();
                LayerCont.clearAll();
                Marker.clearAll();
                poiCont.clearAll();
                winCont.closeModal();
            },
            callback_no: () => winCont.closeModal()
        });
    }
}
const mapMaker = new MapMaker();
