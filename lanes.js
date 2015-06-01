"use strict";

var Point2 = require("ndim/point2");
var Iterator = require("collections/iterator");
var Stream = require("gtor/stream");
var Promise = require("gtor/promise");
var PromiseQueue = require("gtor/promise-queue");

module.exports = Lanes;

function Lanes(body, scope) {
    this.items = [];
    this.labels = scope.argument.children.lane.map(getInnerText);
    this.offset = this.labels.length * 24 + 10;
}

function getInnerText(node) {
    return node.innerText;
}

Lanes.prototype.add = function add(component, id, scope) {
    if (id === "this") {
        scope.components.items.value = this.items;
        scope.components.lanes.value = this.labels;
    } else if (id === "lanes:iteration") {
        scope.components.label.value = component.value;
        scope.components.lane.actualNode.style.top = (component.index * 24) + "px";
        scope.components.lane.actualNode.style.left = (25 + component.index * 100) + "px";
    } else if (id === "items:iteration") {
        var item = component.value;
        scope.components.label.value = item.value;
        item.element = scope.components.item.actualNode;
        item.animator = scope.animator.add(item);
        item.lanes = this;
    }
};
