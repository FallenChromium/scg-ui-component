import { Vector2, Vector3 } from "three";
import { ModelBus, ModelContour, ModelEdge, ModelLink, ModelNode, ModelObject } from "./objects-model";
import { LayoutManager } from "./layout";
import { SCgRender } from "./render";
import { SCgEditMode } from "./config";
import { ScAddr, sc_type_edge_mask, sc_type_node } from "ts-sc-client";
import { SCgDebug } from "./debug";

const enum SCgModalMode {
    SCgModalNone =  0,
    SCgModalIdtf =  1,
    SCgModalType =  2
};

const enum KeyCode {
    Escape =  27,
    Enter =  13,
    Delete =  46,
    Key1 =  49,
    Key2 =  50,
    Key3 =  51,
    Key4 =  52,
    Key5 =  53,
    KeyMinusFirefox =  173,
    KeyMinus =  189,
    KeyMinusNum =  109,
    KeyEqualFirefox =  61,
    KeyEqual =  187,
    KeyPlusNum =  107,
    A =  65,
    C =  67,
    I =  73,
    T =  84,
    V =  86,
    Z =  90
};

var clipScgText = "clipScgText";

export class SCgScene {
    listener_array: Array<SCgListener> = [];
    render: SCgRender;
    edit: Function = function () { };
    nodes: Array<ModelNode> = [];
    links: Array<ModelLink> = [];
    edges: Array<ModelEdge> = [];
    contours: Array<ModelContour> = [];
    buses: Array<ModelBus> = [];

    // map with ScAddrs
    objects: Map<number, ModelObject> = Object.create(null);
    edit_mode = SCgEditMode.SCgModeSelect;

    // object, that placed under mouse
    pointed_object: ModelObject | null = null;
    // object, that was mouse pressed
    focused_object: ModelObject | null = null;

    // list of selected objects
    selected_objects: Array<ModelObject> = [];

    // list of object that should be deleted
    deleted_objects: Array<ModelObject> = [];

    // drag line points
    drag_line_points: Array<Vector2> = [];
    // points of selected line object
    line_points: Array<{ pos: Vector2, idx: number }> = [];

    // mouse position
    mouse_pos = new Vector3(0, 0, 0);

    // edge source and target
    edge_data: { source: ScAddr | null, target: ScAddr | null } = { source: null, target: null };

    // bus source
    bus_data: { source: Vector2 | null, end: Vector2 | null } = { source: null, end: null };

    // callback for selection changed
    event_selection_changed: Function | null = null;
    // callback for modal state changes
    event_modal_changed: Function | null = null;
    layout_manager: LayoutManager

    /* Flag to lock any edit operations
     * If this flag is true, then we doesn't need to process any editor operatons, because
     * in that moment shows modal dialog
     */
    modal = SCgModalMode.SCgModalNone;
    listener: any;

    constructor(edit) {
        this.render = new SCgRender(this, "smth");
        this.edit = edit;
        this.layout_manager = new LayoutManager(this);
    }

    updateContours(elements: ModelObject[]) {
        const contours = this.contours;

        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];

            let hasContour = false;
            for (let j = 0; j < contours.length; j++) {
                const contour = contours[j];

                if (element instanceof ModelEdge) {
                    if (contour.isEdgeInPolygon(element)) {
                        if (element.contour) {
                            element.contour.removeChild(element);
                        }
                        contour.addChild(element);
                        hasContour = true;
                    }
                } else {
                    if (contour.isNodeInPolygon(element)) {
                        if (element.contour) {
                            element.contour.removeChild(element);
                        }
                        contour.addChild(element);
                        hasContour = true;
                    }
                }
            }

            if (!hasContour && element.contour) {
                element.contour.removeChild(element);
                element.contour = undefined;
            }
        }
    }

    /**
     * Appends new sc.g-node to scene
     * @param {ModelNode} node Node to append
     */
    appendNode(node: ModelNode) {
        this.nodes.push(node);
        node.scene = this;
    }

    appendLink(link: ModelLink) {
        this.links.push(link);
        link.scene = this;
    }

    /**
     * Appends new sc.g-edge to scene
     * @param {ModelEdge} edge Edge to append
     */
    appendEdge(edge: ModelEdge) {
        this.edges.push(edge);
        edge.scene = this;
    }

    /**
     * Append new sc.g-contour to scene
     * @param {ModelContour} contour Contour to append
     */
    appendContour(contour: ModelContour) {
        this.contours.push(contour);
        contour.scene = this;
    }

    /**
     * Append new sc.g-contour to scene
     * @param {ModelBus} bus Bus to append
     */
    appendBus(bus: ModelBus) {
        this.buses.push(bus);
        bus.scene = this;
    }

    appendObject(obj: ModelObject) {
        if (obj instanceof ModelNode) {
            this.appendNode(obj);
        } else if (obj instanceof ModelLink) {
            this.appendLink(obj);
        } else if (obj instanceof ModelEdge) {
            this.appendEdge(obj);
        } else if (obj instanceof ModelContour) {
            this.appendContour(obj);
        } else if (obj instanceof ModelBus) {
            this.appendBus(obj);
            obj.setSource(obj.source);
        }
    }

    appendAllElementToContours() {
        this.updateContours(this.nodes);
        this.updateContours(this.links);
        this.updateContours(this.edges);
    }

    /**
     * Remove object from scene.
     * @param obj Object to remove
     */
    removeObject(obj: ModelObject) {
        let self = this;

        function remove_from_list(obj: ModelObject, list: Array<ModelObject>) {
            const idx = list.indexOf(obj);
            if (idx < 0) {
                return;
            }
            if (self.pointed_object === obj) {
                self.pointed_object = null;
            }
            list.splice(idx, 1);
        }

        if (obj instanceof ModelNode) {
            remove_from_list(obj, this.nodes);
        } else if (obj instanceof ModelLink) {
            remove_from_list(obj, this.links);
        } else if (obj instanceof ModelEdge) {
            remove_from_list(obj, this.edges);
        } else if (obj instanceof ModelContour) {
            remove_from_list(obj, this.contours);
        } else if (obj instanceof ModelBus) {
            remove_from_list(obj, this.buses);
            obj.destroy();
        }
    }

    addDeletedObjects(arr: Array<ModelObject>) {
        this.deleted_objects = this.deleted_objects.concat(arr);
    }

    cleanDeletedObjects() {
        this.deleted_objects = [];
    }

    // --------- objects destroy -------

    /**
     * Delete objects from scene
     * @param {Array} objects Array of sc.g-objects to delete
     */
    deleteObjects(objects: Array<ModelObject>) {
        let self = this;

        function collect_objects(container, root) {
            if (container.indexOf(root) >= 0)
                return;

            container.push(root);
            for (let idx in root.edges) {
                if (self.edges.indexOf(root.edges[idx]) > -1) collect_objects(container, root.edges[idx]);
            }

            if (root.bus)
                if (self.buses.indexOf(root.bus) > -1) collect_objects(container, root.bus);

            if (root instanceof ModelContour) {
                for (let numberChildren = 0; numberChildren < root.childs.length; numberChildren++) {
                    if (self.nodes.indexOf(root.childs[numberChildren]) > -1) {
                        collect_objects(container, root.childs[numberChildren]);
                    }
                }
            }
        }

        // collect objects for remove
        let objs = [];

        // collect objects for deletion
        for (let idx in objects)
            collect_objects(objs, objects[idx]);

        this.commandManager.execute(new SCgCommandDeleteObjects(objs, this));

        this.updateRender();
    }

    /**
     * Updates render
     */
    updateRender() {
        this.render.update();
    }

    /**
     * Updates render objects state
     */
    updateObjectsVisual() {
        this.render.updateObjects();
    }

    updateLinkVisual() {
        this.render.updateLink();
        this.render.update();
    }

    // --------- layout --------
    layout() {
        this.layout_manager.doLayout();
        this.render.update();
    }

    onLayoutTick() {
    }

    /**
     * Returns size of container, where graph drawing
     */
    getContainerSize() {
        return this.render.getContainerSize();
    }

    /**
     * Return array that contains sc-addrs of all objects in scene
     */
    getScAddrs() {
        let keys = [];
        for (let key in this.objects) {
            keys.push(key);
        }
        return keys;
    }

    /**
     * Return object by sc-addr
     * @param {String} addr sc-addr of object to find
     * @return If object founded, then return it; otherwise return null
     */
    getObjectByScAddr(addr) {
        if (Object.prototype.hasOwnProperty.call(this.objects, addr))
            return this.objects[addr];

        return null;
    }

    /**
     * Selection all object
     */
    selectAll() {
        var self = this;
        var allObjects = [this.nodes, this.edges, this.buses, this.contours, this.links];
        allObjects.forEach(function (setObjects) {
            setObjects.forEach(function (obj) {
                if (!obj.is_selected) {
                    self.selected_objects.push(obj);
                    obj._setSelected(true);
                }
            });
        });
        this.updateObjectsVisual();
        this._fireSelectionChanged();
    }

    /**
     * Append selection to object
     */
    appendSelection(obj) {
        if (obj.is_selected) {
            var idx = this.selected_objects.indexOf(obj);
            this.selected_objects.splice(idx, 1);
            obj._setSelected(false);
        } else {
            this.selected_objects.push(obj);
            obj._setSelected(true);
        }
        this.selectionChanged();
    }

    /**
     * Remove selection from object
     */
    removeSelection(obj) {

        var idx = this.selected_objects.indexOf(obj);

        if (idx == -1 || !obj.is_selected) {
            SCgDebug.error('Trying to remove selection from unselected object');
            return;
        }

        this.selected_objects.splice(idx, 1);
        obj._setSelected(false);

        this.selectionChanged();
    }

    /**
     * Clear selection list
     */
    clearSelection() {

        var need_event = this.selected_objects.length > 0;

        for (idx in this.selected_objects) {
            this.selected_objects[idx]._setSelected(false);
        }

        this.selected_objects.splice(0, this.selected_objects.length);

        if (need_event) this.selectionChanged();
    }

    selectionChanged() {
        this._fireSelectionChanged();

        this.line_points.splice(0, this.line_points.length);
        // if selected any of line objects, then create controls to control it
        if (this.selected_objects.length == 1) {
            var obj = this.selected_objects[0];

            if (obj instanceof ModelEdge || obj instanceof ModelBus || obj instanceof ModelContour) { /* @todo add contour and bus */
                for (idx in obj.points) {
                    this.line_points.push({ pos: obj.points[idx], idx: idx });
                }
            }
        }

        this.updateObjectsVisual();
    }

    // -------- input processing -----------
    onMouseMove(x, y) {
        if (this.modal != SCgModalMode.SCgModalNone) return false; // do nothing
        else return this.listener.onMouseMove(x, y);
    }

    onMouseDown(x, y) {
        if (this.modal != SCgModalMode.SCgModalNone) return false; // do nothing
        else return this.listener.onMouseDown(x, y);
    }

    onMouseUp(x, y) {
        if (this.modal != SCgModalMode.SCgModalNone) return false; // do nothing
        if (!this.pointed_object) {
            this.clearSelection();
        }
        this.focused_object = null;
        return false;
    }

    onMouseDoubleClick(x, y) {
        if (this.modal != SCgModalMode.SCgModalNone) return false; // do nothing
        else this.listener.onMouseDoubleClick(x, y);
    }

    onMouseWheelUp() {
        this.render.changeScale(1.1);
    }

    onMouseWheelDown() {
        this.render.changeScale(0.9);
    }

    onMouseOverObject(obj) {
        if (this.modal != SCgModalMode.SCgModalNone) return false; // do nothing
        this.pointed_object = obj;
    }

    onMouseOutObject(obj) {
        if (this.modal != SCgModalMode.SCgModalNone) return false; // do nothing
        this.pointed_object = null;
    }

    onMouseDownObject(obj) {
        if (this.modal != SCgModalMode.SCgModalNone) return false; // do nothing
        else this.listener.onMouseDownObject(obj);
    }

    onMouseUpObject(obj) {
        return this.listener.onMouseUpObject(obj);
    }

    onKeyDown(event) {
        if (this.modal == SCgModalMode.SCgModalNone && !$("#search-input").is(":focus")) {
            if ((event.which == KeyCode.Z) && event.ctrlKey && event.shiftKey) {
                this.commandManager.redo();
                this.updateRender();
            } else if (event.ctrlKey && (event.which == KeyCode.Z)) {
                this.commandManager.undo();
                this.updateRender();
            } else if (event.ctrlKey && (event.which == KeyCode.C)) {
                localStorage.setItem(clipScgText, GwfFileCreate.createFileWithSelectedObject(this));
            } else if (event.ctrlKey && (event.which == KeyCode.V)) {
                if (localStorage.getItem(clipScgText) !== null) {
                    ScgObjectBuilder.scene = this;
                    this.clearSelection();
                    GwfFileLoader.loadFromText(localStorage.getItem(clipScgText), this.render);
                }
            } else if ((event.which == KeyCode.A) && event.ctrlKey) {
                this.selectAll();
            } else if (event.which == KeyCode.Key1) {
                this.edit.toolSelect().click()
            } else if (event.which == KeyCode.Key2) {
                this.edit.toolEdge().click()
            } else if (event.which == KeyCode.Key3) {
                this.edit.toolBus().click()
            } else if (event.which == KeyCode.Key4) {
                this.edit.toolContour().click()
            } else if (event.which == KeyCode.Key5) {
                this.edit.toolLink().click()
            } else if (event.which == KeyCode.Delete) {
                this.edit.toolDelete().click();
            } else if (event.which == KeyCode.I) {
                if (!this.edit.toolChangeIdtf().hasClass("hidden"))
                    this.edit.toolChangeIdtf().click();
            } else if (event.which == KeyCode.C) {
                if (!this.edit.toolSetContent().hasClass("hidden"))
                    this.edit.toolSetContent().click();
            } else if (event.which == KeyCode.T) {
                if (!this.edit.toolChangeType().hasClass("hidden"))
                    this.edit.toolChangeType().click();
            } else if (event.which == KeyCode.KeyMinusFirefox || event.which == KeyCode.KeyMinus ||
                event.which == KeyCode.KeyMinusNum) {
                this.render.changeScale(0.9);
            } else if (event.which == KeyCode.KeyEqualFirefox || event.which == KeyCode.KeyEqual ||
                event.which == KeyCode.KeyPlusNum) {
                this.render.changeScale(1.1);
            } else {
                this.listener.onKeyDown(event);
            }
        }
        return false;
    }

    onKeyUp(event) {
        if (this.modal == SCgModalMode.SCgModalNone && !$("#search-input").is(":focus")) {
            this.listener.onKeyUp(event);
        }
        return false;
    }

    // -------- edit --------------
    /**
     * Setup new edit mode for scene. Calls from user interface
     * @param {SCgEditMode} mode New edit mode
     */
    setEditMode(mode) {
        if (this.edit_mode === mode) return; // do nothing

        this.edit_mode = mode;
        this.listener = this.listener_array[mode] ? this.listener_array[mode] : this.listener_array[0];

        this.focused_object = null;
        this.edge_data.source = null;
        this.edge_data.target = null;

        this.bus_data.source = null;

        this.resetEdgeMode();
    }

    /**
     * Changes modal state of scene. Just for internal usage
     */
    setModal(value) {
        this.modal = value;
        this._fireModalChanged();
    }

    /**
     * Reset edge creation mode state
     */
    resetEdgeMode() {
        this.drag_line_points.splice(0, this.drag_line_points.length);
        this.render.updateDragLine();

        this.edge_data.source = this.edge_data.target = null;
    }

    /**
     * Revert drag line to specified point. All drag point with index >= idx will be removed
     * @param {Integer} idx Index of drag point to revert.
     */
    revertDragPoint(idx) {

        if (this.edit_mode != SCgEditMode.SCgModeEdge && this.edit_mode != SCgEditMode.SCgModeBus && this.edit_mode != SCgEditMode.SCgModeContour) {
            SCgDebug.error('Work with drag point in incorrect edit mode');
            return;
        }

        this.drag_line_points.splice(idx, this.drag_line_points.length - idx);

        if (this.drag_line_points.length >= 2)
            this.bus_data.end = this.drag_line_points[this.drag_line_points.length - 1];
        else
            this.bus_data.end = null;

        if (this.drag_line_points.length == 0) {
            this.edge_data.source = this.edge_data.target = null;
            this.bus_data.source = null;
        }
        this.render.updateDragLine();
    }

    /**
     * Update selected line point position
     */
    setLinePointPos(idx, pos) {
        if (this.selected_objects.length != 1) {
            SCgDebug.error('Invalid state. Trying to update line point position when there are no selected objects');
            return;
        }

        var edge = this.selected_objects[0];
        if (!(edge instanceof ModelEdge) && !(edge instanceof ModelBus) && !(edge instanceof ModelContour)) {
            SCgDebug.error("Unknown type of selected object");
            return;
        }

        if (edge.points.length <= idx) {
            SCgDebug.error('Invalid index of line point');
            return;
        }
        edge.points[idx].x = pos.x;
        edge.points[idx].y = pos.y;

        edge.requestUpdate();
        edge.need_update = true;
        edge.need_observer_sync = true;

        this.updateObjectsVisual();
    }

    // ------------- events -------------
    _fireSelectionChanged() {
        if (this.event_selection_changed)
            this.event_selection_changed();
    }

    _fireModalChanged() {
        if (this.event_modal_changed)
            this.event_modal_changed();
    }

    isSelectedObjectAllArcsOrAllNodes() {
        var objects = this.selected_objects;
        // TODO: arc_mask -> edge_mask, check whether this works correctly
        var typeMask = objects[0].sc_type & sc_type_edge_mask ? sc_type_edge_mask :
            objects[0].sc_type & sc_type_node ?
                sc_type_node : 0;
        return (objects.every(function (obj) {
            return ((obj.sc_type & typeMask) && !(obj instanceof ModelContour) && !(obj instanceof ModelBus));
        }))
    }

    isSelectedObjectAllHaveScAddr() {
        return (this.selected_objects.some(function (obj) {
            return obj.sc_addr;
        }))
    }
    
}