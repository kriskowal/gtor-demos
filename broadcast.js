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

    var branches = Stream.from(Iterator.range(0, 100)).map(function (n) {
        var item = new Item(n, n);
        lanes.items.push(item);
        item.goToLane(0);
        return Promise.delay(250)
        .then(function () {
            item.transitionToLane(1);
            return item;
        });
    }, null, 1).fork(3);

    branches[0].forEach(function (item) {
        var n = item.value;
        var item = new Item(n, n + 'a');
        lanes.items.push(item);
        item.goToLane(1);
        item.transitionToLane(2);
        return Promise.delay(1000);
    }).done();

    branches[1].forEach(function (item) {
        var n = item.value;
        var item = new Item(n, n + 'b');
        lanes.items.push(item);
        item.goToLane(1);
        item.transitionToLane(3);
        return Promise.delay(2000);
    }).done();

    branches[2].forEach(function (item) {
        var n = item.value;
        var item = new Item(n, n + 'c');
        lanes.items.push(item);
        item.goToLane(1);
        item.transitionToLane(4);
        return Promise.delay(3000);
    }).done();
}
