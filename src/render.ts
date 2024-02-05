import d3 from "d3";
import { type SCgScene } from "./scene";
import { ModelBus, ModelContour, ModelEdge, ModelLink, ModelNode, ModelObject, SCgObjectState } from "./objects-model";
import { SCgAlphabet } from "./alphabet";
import { ScAddr, sc_type_constancy_mask, sc_type_var } from "ts-sc-client";
import { Vector2, Vector3 } from "three";
import { SCgConfig, SCgEditMode, SCgViewMode } from "./config";

export class SCgRender {
    scene: SCgScene
    containerId: any;
    linkBorderWidth: number;
    scale: number;
    translate: number[];
    translate_started: boolean;
    zoomIn: number;
    zoomOut: number;

    d3_drawer
    d3_container;
    d3_drag_line;
    d3_contour_line;
    d3_contours: d3.Selection<Element, ModelContour, any, any>;
    d3_accept_point;
    d3_edges: d3.Selection<Element, ModelEdge, any, any>;
    d3_buses: d3.Selection<Element, ModelBus, any, any>;
    d3_nodes: d3.Selection<Element, ModelNode, any, any>;
    d3_links: d3.Selection<Element, ModelLink, any, any>;
    d3_dragline;
    d3_line_points: d3.Selection<Element, { idx: number, pos: Vector2 }, any, any>;
    line_point_idx: number;
    drag_line_points: d3.Selection<Element, Vector2, any, any>;
    constructor(scene: SCgScene, containerId: string) {
        this.scene = scene;
        this.containerId = containerId;

        this.linkBorderWidth = 5;
        this.scale = 1;
        this.translate = [0, 0];
        this.translate_started = false;
        this.zoomIn = 1.1;
        this.zoomOut = 0.9


        // disable tooltips
        const container = document.getElementById(this.containerId);

        if (container && container.parentElement) {
            container.parentElement.classList.add('ui-no-tooltip');
        }
        else {
            console.error("Couldn't disable tooltips on this container: ", this.containerId);
        }

        this.d3_drawer = d3.select<Window, any>('#' + this.containerId)
            .attr("pointer-events", "all")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("class", "SCgSvg")
            .on('mousemove', function (e: MouseEvent) {
                self.onMouseMove(this, self, e);
            })
            .on('mousedown', function (e: MouseEvent) {
                self.onMouseDown(this, self, e);
            })
            .on('mouseup', function (e: MouseEvent) {
                self.onMouseUp(this, self, e);
            })
            .on('dblclick', function (e: MouseEvent) {
                self.onMouseDoubleClick(this, self, e);
            })
            .on("mouseleave", function (e: MouseEvent) {
                self.scene.onMouseUpObject(e);
                e.stopPropagation();
            })
            .on("wheel", function (e: WheelEvent) {
                self.transformByZoom(e);
            })
            .append<SVGElement>("svg:svg")
            ;

        const svg = document.querySelector<SVGElement>("svg.SCgSvg");
        if (svg) {
            svg.ondragstart = () => false;
        }

        this.scale = 1;
        var self = this;
        //! TODO: fix this
        SCgService.updateContent();
        this.d3_container = this.d3_drawer.append('svg:g')
            .attr("class", "SCgSvg");

        this.initDefs();

        /* this.d3_container.append('svg:rect')
         .style("fill", "url(#backGrad)")
         .attr('width', '10000') //parseInt(this.d3_drawer.style("width")))
         .attr('height', '10000');//parseInt(this.d3_drawer.style("height")));
         */

        this.d3_drag_line = this.d3_container.append('svg:path')
            .attr('class', 'dragline hidden')
            .attr('d', 'M0,0L0,0');
        //! TODO: check whether it does the same as the previous version
        this.d3_contour_line = d3.line().curve(d3.curveCardinalClosed);
        this.d3_contours = this.d3_container.append('svg:g').selectAll('path');
        this.d3_accept_point = this.d3_container.append('svg:use')
            .attr('class', 'SCgAcceptPoint hidden')
            .attr('xlink:href', '#acceptPoint')
            .on('mouseover', function (d) {
                d3.select(this).classed('SCgAcceptPointHighlighted', true);
            })
            .on('mouseout', function (d) {
                d3.select(this).classed('SCgAcceptPointHighlighted', false);
            })
            .on('mousedown', function (e: MouseEvent) {
                self.scene.listener.finishCreation();
                e.stopPropagation();
            });
        this.d3_edges = this.d3_container.append('svg:g').selectAll('path');
        this.d3_buses = this.d3_container.append('svg:g').selectAll('path');
        this.d3_nodes = this.d3_container.append('svg:g').selectAll('g');
        this.d3_links = this.d3_container.append('svg:g').selectAll('g');
        this.d3_dragline = this.d3_container.append('svg:g');
        this.d3_line_points = this.d3_container.append('svg:g').selectAll('g');

        this.line_point_idx = -1;

    }

    transformByZoom(e: WheelEvent) {
        const svg = e.currentTarget
        //! TODO: check whether it's still working
        if (!svg || !(svg instanceof SVGElement)) {
            return;
        }
        const svgRect = svg.getBoundingClientRect();

        const svgX = e.clientX - svgRect.x;
        const svgY = e.clientY - svgRect.y;

        const transformX = (svgX - this.translate[0]) / this.scale;
        const transformY = (svgY - this.translate[1]) / this.scale;

        e.deltaY > 0 ? this.scale *= this.zoomIn : this.scale *= this.zoomOut;

        this.translate[0] = svgX - transformX * this.scale;
        this.translate[1] = svgY - transformY * this.scale;

        this.scene.render._changeContainerTransform()

    }

    // -------------- Definitions --------------------
    initDefs() {
        // define arrow markers for graph links
        var defs = this.d3_drawer.append('svg:defs')

        var grad = defs.append('svg:radialGradient')
            .attr('id', 'backGrad')
            .attr('cx', '50%')
            .attr('cy', '50%')
            .attr('r', '100%').attr("spreadMethod", "pad");

        grad.append('svg:stop')
            .attr('offset', '0%')
            .attr('stop-color', 'rgb(255,253,252)')
            .attr('stop-opacity', '1')
        grad.append('svg:stop')
            .attr('offset', '100%')
            .attr('stop-color', 'rgb(245,245,245)')
            .attr('stop-opacity', '1')

        // line point control
        var p = defs.append('svg:g')
            .attr('id', 'linePoint')
        p.append('svg:circle')
            .attr('cx', 0)
            .attr('cy', 0)
            .attr('r', 10);

        p = defs.append('svg:g')
            .attr('id', 'acceptPoint')
        p.append('svg:circle')
            .attr('cx', 0)
            .attr('cy', 0)
            .attr('r', 10)
        p.append('svg:path')
            .attr('d', 'M-5,-5 L0,5 5,-5');
        p = defs.append('svg:g')
            .attr('id', 'removePoint')
        p.append('svg:circle')
            .attr('cx', 0)
            .attr('cy', 0)
            .attr('r', 10)

        p.append('svg:path')
            .attr('d', 'M-5,-5L5,5M-5,5L5,-5');
    }
    //! param: {base: string} - base css class for an object
    classState(obj: ModelObject, base: string) {
        let res = ' sc-no-default-cmd ui-no-tooltip SCgElement';

        if (SCgConfig.getInstance().viewMode === SCgViewMode.DistanceBasedSCgView) res += ' DBSCgView';

        if (base) res += ' ' + base;

        if (obj.is_selected) res += ' SCgStateSelected';

        if (obj.is_highlighted) res += ' SCgStateHighlighted ';

        switch (obj.state) {
            case SCgObjectState.FromMemory:
                res += ' SCgStateFromMemory';
                break;
            case SCgObjectState.MergedWithMemory:
                res += ' SCgStateMergedWithMemory';
                break;
            case SCgObjectState.NewInMemory:
                res += ' SCgStateNewInMemory';
                break;
            default:
                res += ' SCgStateNormal';
        }

        return res;
    }

    classToogle(o: Element, cl: string, flag: boolean) {
        let item = d3.select(o);
        let str = item.attr("class");
        let res = str ? str.replace(cl, '') : '';
        res = res.replace('  ', ' ');
        if (flag)
            res += ' ' + cl;
        item.attr("class", res);
    }

    appendNodeVisual(g: d3.Selection<Element, ModelObject, any, any>) {
        g.append('svg:use')
            .attr('xlink:href', function (d) {
                return '#' + SCgAlphabet.getDefId(d.sc_type);
            })
            .attr('class', 'sc-no-default-cmd ui-no-tooltip');
    }

    // -------------- draw -----------------------
    update() {
        let self = this;
        // TODO: this selector signature looks shitty
        function eventsWrap(selector: d3.Selection<any, ModelObject, any, any>) {
            selector.on('mouseover', function (this, d) {
                self.classToogle(this, 'SCgStateHighlighted', true);
                if (self.scene.onMouseOverObject(d))
                    d.stopPropagation();
            })
                .on('mouseout', function (this, d) {
                    self.classToogle(this, 'SCgStateHighlighted', false);
                    if (self.scene.onMouseOutObject(d))
                        d.stopPropagation();
                })
                .on('mousedown', function (d) {
                    self.scene.onMouseDownObject(d);
                    if (d.stopPropagation())
                        d.stopPropagation();
                })
                .on('mouseup', function (d) {
                    self.scene.onMouseUpObject(d);
                    if (d.stopPropagation())
                        d.stopPropagation();
                })
                .on("dblclick", function (d) {
                    if (d.stopPropagation())
                        d.stopPropagation();

                    if (SCgConfig.getInstance().viewMode === SCgViewMode.DistanceBasedSCgView) {
                        if (self.scene.getObjectByScAddr(d.sc_addr) instanceof ModelEdge) return;

                        self.sandbox.updateContent(new ScAddr(d.sc_addr));
                        return;
                    }

                    if (SCgConfig.getInstance().editMode === SCgEditMode.SCgViewOnly) return;

                    if (!d.sc_addr) return;

                    if (d.stopPropagation())
                        d.stopPropagation();
                    let windowId = SCWeb.ui.WindowManager.getActiveWindowId();
                    let container = document.getElementById(windowId);
                    SCWeb.core.Main.doDefaultCommandWithFormat([d.sc_addr], $(container).attr("sc-addr-fmt"));
                });
        }

        // add nodes that haven't visual
        this.d3_nodes = this.d3_nodes.data(this.scene.nodes, function (d) {
            return d.id;
        });

        const nodes_g = this.d3_nodes.enter().append<Element>('svg:g')
            .attr("transform", function (d) {
                return 'translate(' + d.position.x + ', ' + d.position.y + ')scale(' + SCgAlphabet.classScale(d) + ')';
            })
            .attr('class', function (d) {
                let classStyle = (d.sc_type & sc_type_constancy_mask) ? 'SCgNode' : 'SCgNodeEmpty';
                classStyle += ' ' + SCgAlphabet.classLevel(d);
                return self.classState(d, classStyle);
            });
        eventsWrap(nodes_g);
        self.appendNodeVisual(nodes_g);

        nodes_g.append('svg:text')
            .attr('class', 'SCgText')
            .attr('x', function (d) {
                return d.scale.x / 1.3;
            })
            .attr('y', function (d) {
                return d.scale.y / 1.3;
            })
            .text(function (d) {
                return d.text;
            });

        this.d3_nodes.exit().remove();

        // add links that are not visualized yet
        this.d3_links = this.d3_links.data(this.scene.links, function (d) {
            return d.id;
        });

        const links_g = this.d3_links.enter().append<Element>('svg:g')
            .attr("transform", function (d) {
                return 'translate(' + d.position.x + ', ' + d.position.y + ')scale(' + SCgAlphabet.classScale(d) + ')';
            })

        links_g.append<Element>('svg:rect')
            .attr('class', function (d) {
                let linkType = 'SCgLink';
                if (d.sc_type & sc_type_var) linkType += ' Var';
                return self.classState(d, linkType);
            })
            .attr('class', 'sc-no-default-cmd ui-no-tooltip');

        links_g.append<Element>('svg:foreignObject')
            .attr('transform', 'translate(' + self.linkBorderWidth * 0.5 + ',' + self.linkBorderWidth * 0.5 + ')')
            .attr("width", "100%")
            .attr("height", "100%")
            .append("xhtml:link_body")
            .style("background", "transparent")
            .style("margin", "0 0 0 0")
            .html(function (d) {
                return '<div id="link_' + self.containerId + '_' + d.id + '" class=\"SCgLinkContainer\"><div id="' + d.containerId + '" style="display: inline-block;" class="impl"></div></div>';
            });

        // Add identifier to sc-link, default (x, y) position
        links_g.append<Element>('svg:text')
            .attr('class', 'SCgText')
            .text(function (d) {
                return d.text;
            })
            .attr('x', function (d) {
                return d.scale.x + self.linkBorderWidth * 2;
            })
            .attr('y', function (d) {
                return d.scale.y + self.linkBorderWidth * 4;
            });
        // TODO: is there a better way to trigger type widening in argument functions?
        eventsWrap(links_g as unknown as d3.Selection<Element, ModelObject, any, any>);

        this.d3_links.exit().remove();

        // update edges visual
        this.d3_edges = this.d3_edges.data(this.scene.edges, function (d) {
            return d.id;
        });

        // add edges that haven't visual
        const edges_g = this.d3_edges.enter().append('svg:g')
            .attr('class', function (d) {
                const classStyle = 'SCgEdge ' + SCgAlphabet.classLevel(d);
                return self.classState(d, classStyle);
            })
            .attr('pointer-events', 'visibleStroke');

        eventsWrap(edges_g as unknown as d3.Selection<Element, ModelObject, any, any>);

        this.d3_edges.exit().remove();

        // update contours visual
        this.d3_contours = this.d3_contours.data(this.scene.contours, function (d) {
            return d.id;
        });

        const contours_g = this.d3_contours.enter().append('svg:polygon')
            .attr('class', function (d) {
                return self.classState(d, 'SCgContour');
            })
            .attr('points', function (d) {
                var verticiesString = "";
                for (var i = 0; i < d.points.length; i++) {
                    var vertex = d.points[i].x + ', ' + d.points[i].y + ' ';
                    verticiesString = verticiesString.concat(vertex);
                }
                return verticiesString;
            })
            .attr('title', function (d) {
                return d.text;
            });
        eventsWrap(contours_g as unknown as d3.Selection<Element, ModelObject, any, any>);

        this.d3_contours.exit().remove();

        // update buses visual
        this.d3_buses = this.d3_buses.data(this.scene.buses, function (d) {
            return d.id;
        });

        const buses_g = this.d3_buses.enter().append<Element>('svg:g')
            .attr('class', function (d) {
                return self.classState(d, 'SCgBus');
            })
            .attr('pointer-events', 'visibleStroke');
        eventsWrap(buses_g as unknown as d3.Selection<Element, ModelObject, any, any>);

        this.d3_buses.exit().remove();

        this.updateObjects();
    }

    updateRemovedObjects(removableObjects: ModelObject[]) {
        function eventsUnwrap(selector: d3.Selection<Element, ModelObject, any, any>) {
            selector.on('mouseover', null)
                .on('mouseout', null)
                .on('mousedown', null)
                .on('mouseup', null)
                .on("dblclick", null);
        }

        const objects = this.d3_container.append<Element>('svg:g').selectAll<Element, ModelObject>('g');
        const d3_removable_objects = objects.data(removableObjects, function (d) {
            return d.id;
        });

        const g = d3_removable_objects.enter().append<Element>('svg:g');

        eventsUnwrap(g);

        d3_removable_objects.exit().remove();
    }

    // -------------- update objects --------------------------
    updateObjects() {
        let self = this;
        this.d3_nodes.each(function (d) {
            if (!d.need_observer_sync) return; // do nothing
            d.need_observer_sync = false;

            let g = d3.select<Element, ModelObject>(this)
                .attr("transform", function (d) {
                    return d.position.x && d.position.y
                        ? 'translate(' + d.position.x + ', ' + d.position.y + ')scale(' + SCgAlphabet.classScale(d) + ')'
                        : null;
                })
                .attr('class', function (d) {
                    let classStyle = (d.sc_type & sc_type_constancy_mask) ? 'SCgNode' : 'SCgNodeEmpty';
                    classStyle += ' ' + SCgAlphabet.classLevel(d);
                    return self.classState(d, classStyle);
                });

            g.select('use')
                .attr('xlink:href', function (d) {
                    return '#' + SCgAlphabet.getDefId(d.sc_type);
                })
                .attr("sc_addr", function (d) {
                    return d.sc_addr;
                });

            g.selectAll<Element, ModelObject>('text').text(function (d) {
                return d.text;
            });
        });

        // TODO: replaced with updateLink because the body of the loop was nearly identical
        this.updateLink()

        this.d3_edges.each(function (d) {
            if (!d.need_observer_sync) return; // do nothing
            d.need_observer_sync = false;

            if (d.need_update)
                d.update();
            let d3_edge = d3.select<Element, ModelEdge>(this);

            SCgAlphabet.updateEdge(d, d3_edge, self.containerId);
            d3_edge.attr('class', function (d) {
                const classStyle = 'SCgEdge ' + SCgAlphabet.classLevel(d);
                return self.classState(d, classStyle);
            })
                .attr("sc_addr", function (d) {
                    return d.sc_addr;
                });
        });

        this.d3_contours.each(function (d) {
            d3.select<Element, ModelContour>(this).attr('d', function (d) {
                if (!d.need_observer_sync) return ""; // do nothing

                if (d.need_update)
                    d.update();

                let d3_contour = d3.select<Element, ModelContour>(this);

                d3_contour.attr('class', function (d) {
                    return self.classState(d, 'SCgContour');
                });

                d3_contour.attr('points', function (d) {
                    var verticiesString = "";
                    for (var i = 0; i < d.points.length; i++) {
                        var vertex = d.points[i].x + ', ' + d.points[i].y + ' ';
                        verticiesString = verticiesString.concat(vertex);
                    }
                    return verticiesString;
                });

                d3_contour.attr('title', function (d) {
                    return d.text;
                });

                d.need_update = false;
                d.need_observer_sync = false;

                return self.d3_contour_line(d.points.map((p) => { return [p.x, p.y] })) + 'Z';
            })
                .attr("sc_addr", function (d) {
                    return d.sc_addr;
                });
        });

        this.d3_buses.each(function (d) {
            if (!d.need_observer_sync) return; // do nothing
            d.need_observer_sync = false;

            if (d.need_update)
                d.update();
            var d3_bus = d3.select<Element, ModelBus>(this);
            SCgAlphabet.updateBus(d, d3_bus);
            d3_bus.attr('class', function (d) {
                return self.classState(d, 'SCgBus');
            });
        });

        this.updateLinePoints();
    }

    updateLink() {
        let self = this;
        this.d3_links.each(function (d) {
            if (!d.contentLoaded) {
                // TODO: state issues, probably state should've been a css class here, not a number
                let links: Record<string, { addr: string, content: string, contentType: string, state: SCgObjectState }> = {};
                // TODO: let's do a better job of null values handling 
                links[d.containerId] = { addr: d.sc_addr?.toString() ?? "", content: d.content, contentType: d.contentType ?? "", state: d.state };
                self.sandbox.createViewersForScLinks(links);

                if (d.state !== SCgObjectState.NewInMemory || d.content.length) d.contentLoaded = true;
            }
            else d.need_observer_sync = false;

            const linkDiv = document.getElementById("link_" + self.containerId + "_" + d.id);
            if (linkDiv) {
                const impl = linkDiv.querySelector('.impl') as HTMLDivElement | null;

                if (!d.content.length) {
                    d.content = impl?.innerHTML || "";
                }
                if (!impl?.innerHTML?.length) {
                    impl!.innerHTML = d.content;
                }
                const imageDiv = linkDiv.querySelector('img');
                const pdfDiv = linkDiv.querySelectorAll('canvas').item(0);
                let g = d3.select<Element, ModelLink>(this);
                g.select('rect')
                    .attr('width', function (d) {
                        if (imageDiv && !isNaN(imageDiv.width)) {
                            d.scale.x = imageDiv.width;
                        } else if (pdfDiv && !isNaN(pdfDiv.width)) {
                            d.scale.x = pdfDiv.width;
                        } else {
                            // TODO has replaced the outerWidth with offsetWidth. Check whether it's working correctly
                            d.scale.x = Math.min(impl!.offsetWidth, 450) + 10;
                        }
                        return d.scale.x + self.linkBorderWidth * 2;
                    })
                    .attr('height', function (d) {
                        if (imageDiv && !isNaN(imageDiv.height)) {
                            d.scale.y = imageDiv.height;
                        } else if (pdfDiv && !isNaN(pdfDiv.height)) {
                            d.scale.y = pdfDiv.height;
                        } else {
                            d.scale.y = Math.min(linkDiv.offsetHeight, 350);
                        }
                        return d.scale.y + self.linkBorderWidth * 2;
                    })
                    .attr('class', function (d) {
                        let classStyle = 'SCgLink ' + SCgAlphabet.classLevel(d);
                        if (d.sc_type & sc_type_var) classStyle += ' Var';
                        return self.classState(d, classStyle);
                    })
                    .attr("sc_addr", function (d) {
                        return d.sc_addr;
                    });

                g.selectAll<Element, ModelLink>(function () {
                    return this.getElementsByTagName("foreignObject");
                })
                    .attr('width', function (d) {
                        return d.scale.x;
                    })
                    .attr('height', function (d) {
                        return d.scale.y;
                    });

                g.attr("transform", function (d) {
                    return 'translate(' + (d.position.x - (d.scale.x + self.linkBorderWidth) * 0.5)
                        + ', ' + (d.position.y - (d.scale.y + self.linkBorderWidth) * 0.5)
                        + ')scale(' + SCgAlphabet.classScale(d) + ')';
                });

                // Update sc-link identifier (x, y) position according to the sc-link width
                g.selectAll<Element, ModelLink>('text')
                    .text(function (d) {
                        return d.text;
                    })
                    .attr('x', function (d) {
                        return d.scale.x + self.linkBorderWidth * 2;
                    })
                    .attr('y', function (d) {
                        return d.scale.y + self.linkBorderWidth * 4;
                    });
            }
        });
        this.updateLinePoints();
    }

    updateTexts() {
        this.d3_nodes.select('text').text(function (d) {
            return d.text;
        });
        this.d3_links.select('text').text(function (d) {
            return d.text;
        });
    }

    requestUpdateAll() {
        this.d3_nodes.each(function (d) {
            d.need_observer_sync = true;
        });
        this.d3_links.each(function (d) {
            d.need_observer_sync = true;
        });
        this.d3_edges.each(function (d) {
            d.need_observer_sync = true;
            d.need_update = true;
        });
        this.d3_contours.each(function (d) {
            d.need_observer_sync = true;
            d.need_update = true;
        });
        this.d3_buses.each(function (d) {
            d.need_observer_sync = true;
            d.need_update = true;
        });
        this.update();
    }

    requestUpdateObjects() {
        this.d3_nodes.each(function (d) {
            d.need_observer_sync = true;
        });
        this.d3_links.each(function (d) {
            d.need_observer_sync = true;
        });
        this.d3_edges.each(function (d) {
            d.need_observer_sync = true;
            d.need_update = true;
        });
        this.d3_contours.each(function (d) {
            d.need_observer_sync = true;
            d.need_update = true;
        });
        this.d3_buses.each(function (d) {
            d.need_observer_sync = true;
            d.need_update = true;
        });
    }

    updateDragLine() {
        var self = this;


        this.d3_drag_line.classed('SCgBus', this.scene.edit_mode == SCgEditMode.SCgModeBus)
            .classed('dragline', true)
            .classed('draglineBus', this.scene.edit_mode == SCgEditMode.SCgModeBus);

        // remove old points
        this.drag_line_points = this.d3_dragline.selectAll('use.SCgRemovePoint');
        const points = this.drag_line_points.data(this.scene.drag_line_points, function (d) {
            return d;
        })
        points.exit().remove();

        points.enter().append('svg:use')
            .attr('class', 'SCgRemovePoint')
            .attr('xlink:href', '#removePoint')
            .attr('transform', function (d) {
                return 'translate(' + d.x + ',' + d.y + ')';
            })
            .on('mouseover', (d) => {
                d3.select(this).classed('SCgRemovePointHighlighted', true);
            })
            .on('mouseout', (d) => {
                d3.select(this).classed('SCgRemovePointHighlighted', false);
            })
            .on('mousedown', function (d) {
                self.scene.revertDragPoint(d.idx);
                d.stopPropagation();
            });


        if (this.scene.edit_mode == SCgEditMode.SCgModeBus || this.scene.edit_mode == SCgEditMode.SCgModeContour) {
            this.d3_accept_point.classed('hidden', this.scene.drag_line_points.length == 0);
            if (this.scene.drag_line_points.length > 0) {
                var pos = this.scene.drag_line_points[0];
                if (this.scene.edit_mode == SCgEditMode.SCgModeBus)
                    pos = this.scene.drag_line_points[this.scene.drag_line_points.length - 1];
                this.d3_accept_point.attr('transform', 'translate(' + (pos.x + 24) + ',' + pos.y + ')');
            }
        } else {
            this.d3_accept_point.classed('hidden', true);
        }

        if (this.scene.drag_line_points.length < 1) {
            this.d3_drag_line.classed('hidden', true);
        } else {

            this.d3_drag_line.classed('hidden', false);

            var d_str = '';
            // create path description
            for (const [idx, pt] of this.scene.drag_line_points.entries()) {

                if (idx == 0)
                    d_str += 'M';
                else
                    d_str += 'L';
                d_str += pt.x + ',' + pt.y;
            }

            d_str += 'L' + this.scene.mouse_pos.x + ',' + this.scene.mouse_pos.y;

            // update drag line
            this.d3_drag_line.attr('d', d_str);
        }
    }

    updateLinePoints() {
        var self = this;
        var oldPoints: Vector3[] = [];

        const line_points = this.d3_line_points.selectAll<Element, { idx: number, pos: Vector2 }>('use');
        const points = line_points.data(this.scene.line_points, function (d) {
            return d.idx
        })
        points.exit().remove();

        if (this.scene.line_points.length == 0)
            this.line_point_idx = -1;

        points.enter().append<Element>('svg:use')
            .classed('SCgLinePoint', true)
            .attr('xlink:href', '#linePoint')
            .attr('transform', function (d) {
                return 'translate(' + d.pos.x + ',' + d.pos.y + ')';
            })
            .on('mouseover', function (d) {
                d3.select<Element, { idx: number, pos: Vector2 }>(this).classed('SCgLinePointHighlighted', true);
            })
            .on('mouseout', function (d) {
                d3.select<Element, { idx: number, pos: Vector2 }>(this).classed('SCgLinePointHighlighted', false);
            })
            .on('mousedown', function (e: MouseEvent, d) {
                if (self.scene.selected_objects.length == 1 && (self.scene.selected_objects[0] instanceof (ModelEdge || ModelBus))) {
                    if (self.line_point_idx < 0) {
                        oldPoints = self.scene.selected_objects[0].points.map((vertex) => {
                            return new Vector3().copy(vertex);
                        });
                        self.line_point_idx = d.idx;
                    } else {
                        var newPoints = self.scene.selected_objects[0].points.map((vertex) => {
                            return new Vector3().copy(vertex);
                        });
                        self.scene.commandManager.execute(new SCgCommandMovePoint(self.scene.selected_objects[0],
                            oldPoints,
                            newPoints,
                            self.scene),
                            true);
                        self.line_point_idx = -1;
                    }
                }
            })
            .on('dblclick', function () {
                self.line_point_idx = -1;
            })
            .on('mouseup', function () {
                self.scene.appendAllElementToContours();
            });

        line_points.each((d) => {
            d3.select<Element, { idx: number, pos: Vector2 }>(this).attr('transform', function (d) {
                return 'translate(' + d.pos.x + ',' + d.pos.y + ')';
            });
        });
    }

    _changeContainerTransform(translate?: [number, number], scale?: number) {
        if (translate) {
            this.translate[0] = translate[0];
            this.translate[1] = translate[1];
        }
        this.scale = scale || this.scale;
        this.d3_container.attr("transform", "translate(" + this.translate + ")scale(" + this.scale + ")");
    }

    changeScale(mult: number) {
        if (mult === 0)
            throw "Invalid scale multiplier";

        this.scale *= mult;
        var scale = Math.max(2, Math.min(0.1, this.scale));
        this._changeContainerTransform();
    }

    changeTranslate(delta: [number, number]) {

        this.translate[0] += delta[0] * this.scale;
        this.translate[1] += delta[1] * this.scale;

        this._changeContainerTransform();
    }

    // --------------- Events --------------------
    _correctPoint(p: [number, number]) {
        p[0] -= this.translate[0];
        p[1] -= this.translate[1];

        p[0] /= this.scale;
        p[1] /= this.scale;
        return p;
    }

    onMouseDown(window: Window, render: SCgRender, e: MouseEvent) {
        var point = this._correctPoint(d3.pointer(window));
        if (render.scene.onMouseDown(point[0], point[1]))
            return;

        this.translate_started = true;
    }

    onMouseUp(window: Window, render: SCgRender, e: MouseEvent) {

        if (this.translate_started) {
            this.translate_started = false;
            return;
        }

        var point = this._correctPoint(d3.pointer(window));

        if (this.line_point_idx >= 0) {
            this.line_point_idx = -1;
            e.stopPropagation();
            return;
        }

        if (render.scene.onMouseUp(point[0], point[1]))
            e.stopPropagation();
    }

    onMouseMove(window: Window, render: SCgRender, e: MouseEvent) {

        if (this.translate_started)
            this.changeTranslate([e.movementX, e.movementY]);

        var point = this._correctPoint(d3.pointer(window));

        if (this.line_point_idx >= 0) {
            this.scene.setLinePointPos(this.line_point_idx, { x: point[0], y: point[1] });
            e.stopPropagation();
        }

        if (render.scene.onMouseMove(point[0], point[1]))
            e.stopPropagation();
    }

    onMouseDoubleClick(window: Window, render: SCgRender, e: MouseEvent) {
        var point = this._correctPoint(d3.pointer(window));
        if (this.scene.onMouseDoubleClick(point[0], point[1]))
            e.stopPropagation();
    }

    onKeyDown(event: KeyboardEvent) {
        // do not send event to other listeners, if it processed in scene
        if (this.scene.onKeyDown(event))
            event.stopPropagation();
    }

    onMouseWheelUp(event: KeyboardEvent) {
        // do not send event to other listeners, if it processed in scene
        if (this.scene.onKeyUp(event))
            event.stopPropagation();
    }

    onMouseWheelDown(event: KeyboardEvent) {
        // do not send event to other listeners, if it processed in scene
        if (this.scene.onKeyUp(event))
            event.stopPropagation();
    }

    onKeyUp(event: KeyboardEvent) {
        // do not send event to other listeners, if it processed in scene
        if (this.scene.onKeyUp(event))
            event.stopPropagation();
    }

    // ------- help functions -----------
    getContainerSize() {
        const el = document.getElementById(this.containerId);
        if (!el) {
            throw new Error("Couldn't find container with id " + this.containerId);
        }
        return [el.clientWidth, el.clientHeight];
    }
}
