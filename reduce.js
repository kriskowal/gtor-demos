"use strict";

var Point2 = require("ndim/point2");
var Iterator = require("collections/iterator");
var Stream = require("gtor/stream");
var Task = require("gtor/task");
var PromiseQueue = require("gtor/promise-queue");
var Item = require("./item");

module.exports = Reduce;

function Reduce() {
}

Reduce.prototype.add = function (component, id, scope) {
    if (id === "this") {
        this.lanes = scope.components.lanes;
        this.setup();
    }
};

Reduce.prototype.setup = function () {
    var self = this;
    var lanes = self.lanes;

    Stream.from(Iterator.range(0, 200))
    .map(function (n) {
        var item = new Item(n, (Math.random() * 100) | 0);
        lanes.items.push(item);
        item.goToLane(0);
        return item;
    })
    .reduce(function (a, b) {
        a.transitionToLane(1);
        b.transitionToLane(2);
        return Task.delay(Math.random() * 500 + 500)
        .then(function () {
            var temp;
            if (a.value < b.value) {
                temp = a;
                a = b;
                b = temp;
            }
            a.transitionToLane(0);
            b.transitionToLane(3);
            return Task.delay(500).thenReturn(a);
        });
    }, 4)
    .then(function (result) {
        result.transitionToLane(4);
    })
    .done();
}
