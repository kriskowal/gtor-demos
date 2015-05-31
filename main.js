"use strict";

var Point2 = require("ndim/point2");
var Iterator = require("collections/iterator");
var Stream = require("gtor/stream");
var Promise = require("gtor/promise");
var PromiseQueue = require("gtor/promise-queue");

module.exports = Main;

function Main() {
    this.items = [];
}

Main.prototype.add = function add(component, id, scope) {
    if (id === "this") {
        scope.components.items.value = this.items;
        this.setup();
    } else if (id === "items:iteration") {
        var item = component.value;
        scope.components.label.value = item.value;
        item.element = scope.components.item.actualNode;
        item.animator = scope.animator.add(item);
    }
};

Main.prototype.setup = function () {
    var self = this;
    var buffer = Stream.buffer(20);

    var origin = new Point2(0, 0);
    Stream.from(Iterator.count()).forEach(function (n) {
        var item = new Item(n);
        self.items.push(item);
        item.transitionTo(origin.clone().addThis({x: 0, y: item.value * 2}));
        return buffer.in.yield(item);
    }, null, 1);

    var target1 = new Point2(100, 0);
    buffer.out.forEach(function (item) {
        item.transitionTo(target1.clone().addThis({x: 0, y: item.value * 2}));
        return Promise.delay(500);
    }, null, 1).done();

    var target2 = new Point2(200, 0);
    buffer.out.forEach(function (item) {
        item.transitionTo(target2.clone().addThis({x: 0, y: item.value * 2}));
        return Promise.delay(1000);
    }, null, 2).done();

    return; // XXX

    var target3 = new Point2(300, 0);
    buffer.out.forEach(function (item) {
        item.transitionTo(target3.clone().addThis({x: 0, y: item.value * 2}));
        return Promise.delay(10000);
    }, null, 10).done();

}

function Item(value) {
    this.value = value;
    this.element = null;
    this.animator = null;
    this.source = new Point2(0, 0);
    this.target = new Point2(0, 0);
}

Item.prototype.drawAt = function (source) {
    this.source.become(source);
    this.animator.requestDraw();
};

Item.prototype.transitionTo = function (target) {
    this.target.become(target);
    this.animator.requestTransition();
};

Item.prototype.draw = function animate() {
    this.element.style.top = this.source.y + "px";
    this.element.style.left = this.source.x + "px";
    this.element.style.transition = "none";
};

Item.prototype.transition = function transition() {
    this.element.style.transition = "ease 500ms";
    this.element.style.top = this.target.y + "px";
    this.element.style.left = this.target.x + "px";
    this.source.become(this.target);
};

