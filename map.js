"use strict";

var Point2 = require("ndim/point2");
var Iterator = require("collections/iterator");
var Stream = require("gtor/stream");
var Task = require("gtor/task");
var PromiseQueue = require("gtor/promise-queue");
var Item = require("./item");

module.exports = Map;

function Map() {
}

Map.prototype.add = function (component, id, scope) {
    if (id === "this") {
        this.lanes = scope.components.lanes;
        this.setup();
    }
};

Map.prototype.setup = function () {
    var self = this;
    var lanes = self.lanes;

    Stream.from(Iterator.range(0, 200))
    .map(function (n) {
        var item = new Item(n, n);
        lanes.items.push(item);
        item.goToLane(0);
        return item;
    }, 5)
    .map(function (item) {
        item.transitionToLane(1);
        return Task.delay(Math.random() * 1000).thenReturn(item);
    }, null, 32)
    .map(function (item) {
        item.transitionToLane(2);
        return Task.delay(Math.random() * 1000).thenReturn(item);
    }, null, 16)
    .map(function (item) {
        item.transitionToLane(3);
        return Task.delay(Math.random() * 1000).thenReturn(item);
    }, null, 4)
    .map(function (item) {
        item.transitionToLane(4);
        return Task.delay(Math.random() * 1000).thenReturn(item);
    }, null, 1)
    .forEach(function (item) {
        item.transitionToLane(5);
    })
    .done();
}
