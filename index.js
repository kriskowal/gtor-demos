"use strict";

var Document = require("gutentag/document");
var Scope = require("gutentag/scope");
var Animator = require("blick");
var Main = require("./main.html");

var scope = new Scope();
scope.animator = new Animator();
var document = new Document(window.document.body);
var main = new Main(document.documentElement, scope);
