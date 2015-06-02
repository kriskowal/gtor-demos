"use strict";

var Point2 = require("ndim/point2");
var Iterator = require("collections/iterator");
var Stream = require("gtor/stream");
var Promise = require("gtor/promise");
var PromiseQueue = require("gtor/promise-queue");
var Item = require("./item");

module.exports = Multicast;

function Multicast() {
}

Multicast.prototype.add = function (component, id, scope) {
    if (id === "this") {
        this.lanes = scope.components.lanes;
        this.setup();
    }
};

Multicast.prototype.setup = function () {
    var self = this;
    var lanes = self.lanes;
    var buffer = Stream.buffer(20);

    Stream.from(Iterator.range(0, 100)).forEach(function (n) {
        var item = new Item(n);
        lanes.items.push(item);
        item.goToLane(0);
        return buffer.in.yield(item);
    }, null, 1);

    buffer.out.forEach(function (item) {
        item.transitionToLane(1);
        return Promise.delay(500);
    }, null, 1).done();

    buffer.out.forEach(function (item) {
        item.transitionToLane(2);
        return Promise.delay(1000);
    }, null, 3).done();
}
