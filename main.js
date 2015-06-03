"use strict";

module.exports = Main;

function Main() {
    this.demos = null;
}

Main.prototype.add = function (component, id, scope) {
    if (id === "this") {
        this.demos = scope.components.demos;
        scope.components.menu.actualNode.addEventListener("click", this);
        scope.components.demos.value = "e";
    }
};

Main.prototype.handleEvent = function handleEvent(event) {
    this.demos.value = event.target.value;
};
