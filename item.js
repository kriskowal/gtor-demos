"use strict";

var Point2 = require("ndim/point2");

module.exports = Item;

function Item(order, value) {
    this.order = order;
    this.value = value;
    this.element = null;
    this.label = null;
    this.animator = null;
    this.lanes = null;
    this.source = new Point2(0, 0);
    this.target = new Point2(0, 0);
}

var h = new Point2(100, 0);
var v = new Point2(0, 2);
var temp = new Point2();
var temp2 = new Point2();

Item.prototype.goToLane = function (laneIndex) {
    temp.become(h).scaleThis(laneIndex);
    temp2.become(v).scaleThis(this.order).addThis(temp);
    temp2.y += this.lanes.offset;
    this.goTo(temp2);
};

Item.prototype.transitionToLane = function (laneIndex) {
    temp.become(h).scaleThis(laneIndex);
    temp2.become(v).scaleThis(this.order).addThis(temp);
    temp2.y += this.lanes.offset;
    this.transitionTo(temp2);
};

Item.prototype.goTo = function (source) {
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
