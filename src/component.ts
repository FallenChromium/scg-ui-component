import { ScClient, sc_type_link, sc_type_node, sc_type_edge_mask, ScAddr, ScType } from "ts-sc-client";
import { SCgObjectState } from "./objects-model";

const SCgComponent = {
    ext_lang: 'scg_code',
    formats: ['format_scg_json'],
    struct_support: true,
    factory: function () {
        return new SCgViewerWindow();
    }
};


/**
 * SCgViewerWindow
 * @param sandbox
 * @constructor
 */

export class SCgViewerWindow {
    editor
    scClient: ScClient
    scStructTranslator: SCgStructTranslator
    canEdit: boolean

    constructor(client: ScClient, canEdit: boolean) {
        const self = this;
        this.scClient = client;
        this.editor = new SCg.Editor();
        this.canEdit = canEdit
        if (sandbox.is_struct) {
            this.scStructTranslator = new SCgStructTranslator(this.editor, this.sandbox);
        }
    
    
        // delegate event handlers
        this.sandbox.eventDataAppend = $.proxy(this.receiveData, this);
        this.sandbox.eventGetObjectsToTranslate = $.proxy(this.getObjectsToTranslate, this);
        this.sandbox.eventApplyTranslation = $.proxy(this.applyTranslation, this);
        this.sandbox.eventStructUpdate = $.proxy(this.eventStructUpdate, this);
    
        this.sandbox.updateContent();
    }
    
    translateToSc(callback: Function) {
        return this.scStructTranslator.translateToSc().then(callback).catch(callback);
    }

    receiveData(data) {
        this._buildGraph(data);
    };

    _buildGraph(data: {id: number, el_type: ScType}[]) {
        var elements = new Map<number, >();
        var edges = [];
        for (var i = 0; i < data.length; i++) {
            var el = data[i];

            if (elements.hasOwnProperty(el.id))
                continue;
            if (Object.prototype.hasOwnProperty.call(this.editor.scene.objects, el.id)) {
                elements[el.id] = this.editor.scene.objects[el.id];
                continue;
            }

            if (el.el_type & sc_type_node || el.el_type & sc_type_link) {
                var model_node = SCg.Creator.createNode(el.el_type, new SCg.Vector3(10 * Math.random(), 10 * Math.random(), 0), '');
                this.editor.scene.appendNode(model_node);
                this.editor.scene.objects[el.id] = model_node;
                model_node.setScAddr(el.id);
                model_node.setObjectState(SCgObjectState.FromMemory);
                elements[el.id] = model_node;
            } else if (el.el_type & sc_type_edge_mask) {
                edges.push(el);
            }
        }

        // create edges
        var founded = true;
        while (edges.length > 0 && founded) {
            founded = false;
            for (const idx in edges) {
                var obj = edges[idx];
                var beginId = obj.begin;
                var endId = obj.end;
                // try to get begin and end object for arc
                if (elements.hasOwnProperty(beginId) && elements.hasOwnProperty(endId)) {
                    var beginNode = elements[beginId];
                    var endNode = elements[endId];
                    founded = true;
                    edges.splice(idx, 1);
                    var model_edge = SCg.Creator.createEdge(beginNode, endNode, obj.el_type);
                    this.editor.scene.appendEdge(model_edge);
                    this.editor.scene.objects[obj.id] = model_edge;
                    model_edge.setScAddr(obj.id);
                    model_edge.setObjectState(SCgObjectState.FromMemory);
                    elements[obj.id] = model_edge;
                }
            }
        }

        if (edges.length > 0)
            alert("error");

        this.editor.render.update();
        this.editor.scene.layout();
    };

    destroy() {
        delete this.editor;
        return true;
    };

    getObjectsToTranslate() {
        return this.editor.scene.getScAddrs();
    };

    applyTranslation(namesMap) {
        for (let addr in namesMap) {
            const obj = this.editor.scene.getObjectByScAddr(addr);
            if (obj) {
                obj.text = namesMap[addr];
            }
        }
        this.editor.render.updateTexts();
    };


    eventStructUpdate() {
        this.scStructTranslator.updateFromSc.apply(this.scStructTranslator, arguments).then(null);
    };
}


// TODO: we still need a component manager, but not the one from the old SC-Web
//SCWeb.core.ComponentManager.appendComponentInitialize(SCgComponent);
