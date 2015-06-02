
var Document = require("gutentag/document");
var Scope = require("gutentag/scope");
var Animator = require("blick");
var Main = require("./map-reduce.html");

var scope = new Scope();
scope.animator = new Animator();
var document = new Document(window.document.body);
var main = new Main(document.documentElement, scope);
