global = this;
(function (modules) {

    // Bundle allows the run-time to extract already-loaded modules from the
    // boot bundle.
    var bundle = {};
    var main;

    // Unpack module tuples into module objects.
    for (var i = 0; i < modules.length; i++) {
        var module = modules[i];
        module = modules[i] = new Module(
            module[0],
            module[1],
            module[2],
            module[3],
            module[4]
        );
        bundle[module.filename] = module;
    }

    function Module(id, dirname, basename, dependencies, factory) {
        this.id = id;
        this.dirname = dirname;
        this.filename = dirname + "/" + basename;
        // Dependency map and factory are used to instantiate bundled modules.
        this.dependencies = dependencies;
        this.factory = factory;
    }

    Module.prototype._require = function () {
        var module = this;
        if (module.exports === void 0) {
            module.exports = {};
            var require = function (id) {
                var index = module.dependencies[id];
                var dependency = modules[index];
                if (!dependency)
                    throw new Error("Bundle is missing a dependency: " + id);
                return dependency._require();
            };
            require.main = main;
            module.exports = module.factory(
                require,
                module.exports,
                module,
                module.filename,
                module.dirname
            ) || module.exports;
        }
        return module.exports;
    };

    // Communicate the bundle to all bundled modules
    Module.prototype.modules = bundle;

    return function require(filename) {
        main = bundle[filename];
        main._require();
    }
})([["browser-asap.js","asap","browser-asap.js",{"./raw":1},function (require, exports, module, __filename, __dirname){

// asap/browser-asap.js
// --------------------

"use strict";

// rawAsap provides everything we need except exception management.
var rawAsap = require("./raw");
// RawTasks are recycled to reduce GC churn.
var freeTasks = [];
// We queue errors to ensure they are thrown in right order (FIFO).
// Array-as-queue is good enough here, since we are just dealing with exceptions.
var pendingErrors = [];
var requestErrorThrow = rawAsap.makeRequestCallFromTimer(throwFirstError);

function throwFirstError() {
    if (pendingErrors.length) {
        throw pendingErrors.shift();
    }
}

/**
 * Calls a task as soon as possible after returning, in its own event, with priority
 * over other events like animation, reflow, and repaint. An error thrown from an
 * event will not interrupt, nor even substantially slow down the processing of
 * other events, but will be rather postponed to a lower priority event.
 * @param {{call}} task A callable object, typically a function that takes no
 * arguments.
 */
module.exports = asap;
function asap(task) {
    var rawTask;
    if (freeTasks.length) {
        rawTask = freeTasks.pop();
    } else {
        rawTask = new RawTask();
    }
    rawTask.task = task;
    rawAsap(rawTask);
}

// We wrap tasks with recyclable task objects.  A task object implements
// `call`, just like a function.
function RawTask() {
    this.task = null;
}

// The sole purpose of wrapping the task is to catch the exception and recycle
// the task object after its single use.
RawTask.prototype.call = function () {
    try {
        this.task.call();
    } catch (error) {
        if (asap.onerror) {
            // This hook exists purely for testing purposes.
            // Its name will be periodically randomized to break any code that
            // depends on its existence.
            asap.onerror(error);
        } else {
            // In a web browser, exceptions are not fatal. However, to avoid
            // slowing down the queue of pending tasks, we rethrow the error in a
            // lower priority turn.
            pendingErrors.push(error);
            requestErrorThrow();
        }
    } finally {
        this.task = null;
        freeTasks[freeTasks.length] = this;
    }
};

}],["browser-raw.js","asap","browser-raw.js",{},function (require, exports, module, __filename, __dirname){

// asap/browser-raw.js
// -------------------

"use strict";

// Use the fastest means possible to execute a task in its own turn, with
// priority over other events including IO, animation, reflow, and redraw
// events in browsers.
//
// An exception thrown by a task will permanently interrupt the processing of
// subsequent tasks. The higher level `asap` function ensures that if an
// exception is thrown by a task, that the task queue will continue flushing as
// soon as possible, but if you use `rawAsap` directly, you are responsible to
// either ensure that no exceptions are thrown from your task, or to manually
// call `rawAsap.requestFlush` if an exception is thrown.
module.exports = rawAsap;
function rawAsap(task) {
    if (!queue.length) {
        requestFlush();
        flushing = true;
    }
    // Equivalent to push, but avoids a function call.
    queue[queue.length] = task;
}

var queue = [];
// Once a flush has been requested, no further calls to `requestFlush` are
// necessary until the next `flush` completes.
var flushing = false;
// `requestFlush` is an implementation-specific method that attempts to kick
// off a `flush` event as quickly as possible. `flush` will attempt to exhaust
// the event queue before yielding to the browser's own event loop.
var requestFlush;
// The position of the next task to execute in the task queue. This is
// preserved between calls to `flush` so that it can be resumed if
// a task throws an exception.
var index = 0;
// If a task schedules additional tasks recursively, the task queue can grow
// unbounded. To prevent memory exhaustion, the task queue will periodically
// truncate already-completed tasks.
var capacity = 1024;

// The flush function processes all tasks that have been scheduled with
// `rawAsap` unless and until one of those tasks throws an exception.
// If a task throws an exception, `flush` ensures that its state will remain
// consistent and will resume where it left off when called again.
// However, `flush` does not make any arrangements to be called again if an
// exception is thrown.
function flush() {
    while (index < queue.length) {
        var currentIndex = index;
        // Advance the index before calling the task. This ensures that we will
        // begin flushing on the next task the task throws an error.
        index = index + 1;
        queue[currentIndex].call();
        // Prevent leaking memory for long chains of recursive calls to `asap`.
        // If we call `asap` within tasks scheduled by `asap`, the queue will
        // grow, but to avoid an O(n) walk for every task we execute, we don't
        // shift tasks off the queue after they have been executed.
        // Instead, we periodically shift 1024 tasks off the queue.
        if (index > capacity) {
            // Manually shift all values starting at the index back to the
            // beginning of the queue.
            for (var scan = 0, newLength = queue.length - index; scan < newLength; scan++) {
                queue[scan] = queue[scan + index];
            }
            queue.length -= index;
            index = 0;
        }
    }
    queue.length = 0;
    index = 0;
    flushing = false;
}

// `requestFlush` is implemented using a strategy based on data collected from
// every available SauceLabs Selenium web driver worker at time of writing.
// https://docs.google.com/spreadsheets/d/1mG-5UYGup5qxGdEMWkhP6BWCz053NUb2E1QoUTU16uA/edit#gid=783724593

// Safari 6 and 6.1 for desktop, iPad, and iPhone are the only browsers that
// have WebKitMutationObserver but not un-prefixed MutationObserver.
// Must use `global` instead of `window` to work in both frames and web
// workers. `global` is a provision of Browserify, Mr, Mrs, or Mop.
var BrowserMutationObserver = global.MutationObserver || global.WebKitMutationObserver;

// MutationObservers are desirable because they have high priority and work
// reliably everywhere they are implemented.
// They are implemented in all modern browsers.
//
// - Android 4-4.3
// - Chrome 26-34
// - Firefox 14-29
// - Internet Explorer 11
// - iPad Safari 6-7.1
// - iPhone Safari 7-7.1
// - Safari 6-7
if (typeof BrowserMutationObserver === "function") {
    requestFlush = makeRequestCallFromMutationObserver(flush);

// MessageChannels are desirable because they give direct access to the HTML
// task queue, are implemented in Internet Explorer 10, Safari 5.0-1, and Opera
// 11-12, and in web workers in many engines.
// Although message channels yield to any queued rendering and IO tasks, they
// would be better than imposing the 4ms delay of timers.
// However, they do not work reliably in Internet Explorer or Safari.

// Internet Explorer 10 is the only browser that has setImmediate but does
// not have MutationObservers.
// Although setImmediate yields to the browser's renderer, it would be
// preferrable to falling back to setTimeout since it does not have
// the minimum 4ms penalty.
// Unfortunately there appears to be a bug in Internet Explorer 10 Mobile (and
// Desktop to a lesser extent) that renders both setImmediate and
// MessageChannel useless for the purposes of ASAP.
// https://github.com/kriskowal/q/issues/396

// Timers are implemented universally.
// We fall back to timers in workers in most engines, and in foreground
// contexts in the following browsers.
// However, note that even this simple case requires nuances to operate in a
// broad spectrum of browsers.
//
// - Firefox 3-13
// - Internet Explorer 6-9
// - iPad Safari 4.3
// - Lynx 2.8.7
} else {
    requestFlush = makeRequestCallFromTimer(flush);
}

// `requestFlush` requests that the high priority event queue be flushed as
// soon as possible.
// This is useful to prevent an error thrown in a task from stalling the event
// queue if the exception handled by Node.js’s
// `process.on("uncaughtException")` or by a domain.
rawAsap.requestFlush = requestFlush;

// To request a high priority event, we induce a mutation observer by toggling
// the text of a text node between "1" and "-1".
function makeRequestCallFromMutationObserver(callback) {
    var toggle = 1;
    var observer = new BrowserMutationObserver(callback);
    var node = document.createTextNode("");
    observer.observe(node, {characterData: true});
    return function requestCall() {
        toggle = -toggle;
        node.data = toggle;
    };
}

// The message channel technique was discovered by Malte Ubl and was the
// original foundation for this library.
// http://www.nonblocking.io/2011/06/windownexttick.html

// Safari 6.0.5 (at least) intermittently fails to create message ports on a
// page's first load. Thankfully, this version of Safari supports
// MutationObservers, so we don't need to fall back in that case.

// function makeRequestCallFromMessageChannel(callback) {
//     var channel = new MessageChannel();
//     channel.port1.onmessage = callback;
//     return function requestCall() {
//         channel.port2.postMessage(0);
//     };
// }

// For reasons explained above, we are also unable to use `setImmediate`
// under any circumstances.
// Even if we were, there is another bug in Internet Explorer 10.
// It is not sufficient to assign `setImmediate` to `requestFlush` because
// `setImmediate` must be called *by name* and therefore must be wrapped in a
// closure.
// Never forget.

// function makeRequestCallFromSetImmediate(callback) {
//     return function requestCall() {
//         setImmediate(callback);
//     };
// }

// Safari 6.0 has a problem where timers will get lost while the user is
// scrolling. This problem does not impact ASAP because Safari 6.0 supports
// mutation observers, so that implementation is used instead.
// However, if we ever elect to use timers in Safari, the prevalent work-around
// is to add a scroll event listener that calls for a flush.

// `setTimeout` does not call the passed callback if the delay is less than
// approximately 7 in web workers in Firefox 8 through 18, and sometimes not
// even then.

function makeRequestCallFromTimer(callback) {
    return function requestCall() {
        // We dispatch a timeout with a specified delay of 0 for engines that
        // can reliably accommodate that request. This will usually be snapped
        // to a 4 milisecond delay, but once we're flushing, there's no delay
        // between events.
        var timeoutHandle = setTimeout(handleTimer, 0);
        // However, since this timer gets frequently dropped in Firefox
        // workers, we enlist an interval handle that will try to fire
        // an event 20 times per second until it succeeds.
        var intervalHandle = setInterval(handleTimer, 50);

        function handleTimer() {
            // Whichever timer succeeds will cancel both timers and
            // execute the callback.
            clearTimeout(timeoutHandle);
            clearInterval(intervalHandle);
            callback();
        }
    };
}

// This is for `asap.js` only.
// Its name will be periodically randomized to break any code that depends on
// its existence.
rawAsap.makeRequestCallFromTimer = makeRequestCallFromTimer;

// ASAP was originally a nextTick shim included in Q. This was factored out
// into this ASAP package. It was later adapted to RSVP which made further
// amendments. These decisions, particularly to marginalize MessageChannel and
// to capture the MutationObserver implementation in a closure, were integrated
// back into ASAP proper.
// https://github.com/tildeio/rsvp.js/blob/cddf7232546a9cf858524b75cde6f9edf72620a7/lib/rsvp/asap.js

}],["animator.js","blick","animator.js",{"raf":54},function (require, exports, module, __filename, __dirname){

// blick/animator.js
// -----------------

"use strict";

var defaultRequestAnimation = require("raf");

module.exports = Animator;

function Animator(requestAnimation) {
    var self = this;
    self._requestAnimation = requestAnimation || defaultRequestAnimation;
    self.controllers = [];
    // This thunk is doomed to deoptimization for multiple reasons, but passes
    // off as quickly as possible to the unrolled animation loop.
    self._animate = function () {
        try {
            self.animate();
        } catch (error) {
            self.requestAnimation();
            throw error;
        }
    };
}

Animator.prototype.requestAnimation = function () {
    if (!this.requested) {
        this._requestAnimation(this._animate);
    }
    this.requested = true;
};

// Unrolled
Animator.prototype.animate = function () {
    var node, temp;

    this.requested = false;

    // Measure
    for (var index = 0; index < this.controllers.length; index++) {
        var controller = this.controllers[index];
        if (controller.measure) {
            controller.component.measure();
            controller.measure = false;
        }
    }

    // Transition
    for (var index = 0; index < this.controllers.length; index++) {
        var controller = this.controllers[index];
        // Unlke others, skipped if draw or redraw are scheduled and left on
        // the schedule for the next animation frame.
        if (controller.transition) {
            if (!controller.draw && !controller.redraw) {
                controller.component.transition();
                controller.transition = false;
            } else {
                this.requestAnimation();
            }
        }
    }

    // Animate
    // If any components have animation set, continue animation.
    for (var index = 0; index < this.controllers.length; index++) {
        var controller = this.controllers[index];
        if (controller.animate) {
            controller.component.animate();
            this.requestAnimation();
            // Unlike others, not reset implicitly.
        }
    }

    // Draw
    for (var index = 0; index < this.controllers.length; index++) {
        var controller = this.controllers[index];
        if (controller.draw) {
            controller.component.draw();
            controller.draw = false;
        }
    }

    // Redraw
    for (var index = 0; index < this.controllers.length; index++) {
        var controller = this.controllers[index];
        if (controller.redraw) {
            controller.component.redraw();
            controller.redraw = false;
        }
    }
};

Animator.prototype.add = function (component) {
    var controller = new AnimationController(component, this);
    this.controllers.push(controller);
    return controller;
};

function AnimationController(component, controller) {
    this.component = component;
    this.controller = controller;

    this.measure = false;
    this.transition = false;
    this.animate = false;
    this.draw = false;
    this.redraw = false;
}

AnimationController.prototype.destroy = function () {
};

AnimationController.prototype.requestMeasure = function () {
    if (!this.component.measure) {
        throw new Error("Can't requestMeasure because component does not implement measure");
    }
    this.measure = true;
    this.controller.requestAnimation();
};

AnimationController.prototype.cancelMeasure = function () {
    this.measure = false;
};

AnimationController.prototype.requestTransition = function () {
    if (!this.component.transition) {
        throw new Error("Can't requestTransition because component does not implement transition");
    }
    this.transition = true;
    this.controller.requestAnimation();
};

AnimationController.prototype.cancelTransition = function () {
    this.transition = false;
};

AnimationController.prototype.requestAnimation = function () {
    if (!this.component.animate) {
        throw new Error("Can't requestAnimation because component does not implement animate");
    }
    this.animate = true;
    this.controller.requestAnimation();
};

AnimationController.prototype.cancelAnimation = function () {
    this.animate = false;
};

AnimationController.prototype.requestDraw = function () {
    if (!this.component.draw) {
        throw new Error("Can't requestDraw because component does not implement draw");
    }
    this.draw = true;
    this.controller.requestAnimation();
};

AnimationController.prototype.cancelDraw = function () {
    this.draw = false;
};

AnimationController.prototype.requestRedraw = function () {
    if (!this.component.redraw) {
        throw new Error("Can't requestRedraw because component does not implement redraw");
    }
    this.redraw = true;
    this.controller.requestAnimation();
};

AnimationController.prototype.cancelRedraw = function () {
    this.redraw = false;
};

}],["generic-collection.js","collections","generic-collection.js",{"./shim-array":6},function (require, exports, module, __filename, __dirname){

// collections/generic-collection.js
// ---------------------------------

"use strict";

module.exports = GenericCollection;
function GenericCollection() {
    throw new Error("Can't construct. GenericCollection is a mixin.");
}

GenericCollection.prototype.addEach = function (values) {
    if (values && Object(values) === values) {
        if (typeof values.forEach === "function") {
            values.forEach(this.add, this);
        } else if (typeof values.length === "number") {
            // Array-like objects that do not implement forEach, ergo,
            // Arguments
            for (var i = 0; i < values.length; i++) {
                this.add(values[i], i);
            }
        } else {
            Object.keys(values).forEach(function (key) {
                this.add(values[key], key);
            }, this);
        }
    }
    return this;
};

// This is sufficiently generic for Map (since the value may be a key)
// and ordered collections (since it forwards the equals argument)
GenericCollection.prototype.deleteEach = function (values, equals) {
    values.forEach(function (value) {
        this["delete"](value, equals);
    }, this);
    return this;
};

// all of the following functions are implemented in terms of "reduce".
// some need "constructClone".

GenericCollection.prototype.forEach = function (callback /*, thisp*/) {
    var thisp = arguments[1];
    return this.reduce(function (undefined, value, key, object, depth) {
        callback.call(thisp, value, key, object, depth);
    }, undefined);
};

GenericCollection.prototype.map = function (callback /*, thisp*/) {
    var thisp = arguments[1];
    var result = [];
    this.reduce(function (undefined, value, key, object, depth) {
        result.push(callback.call(thisp, value, key, object, depth));
    }, undefined);
    return result;
};

GenericCollection.prototype.enumerate = function (start) {
    if (start == null) {
        start = 0;
    }
    var result = [];
    this.reduce(function (undefined, value) {
        result.push([start++, value]);
    }, undefined);
    return result;
};

GenericCollection.prototype.group = function (callback, thisp, equals) {
    equals = equals || Object.equals;
    var groups = [];
    var keys = [];
    this.forEach(function (value, key, object) {
        var key = callback.call(thisp, value, key, object);
        var index = keys.indexOf(key, equals);
        var group;
        if (index === -1) {
            group = [];
            groups.push([key, group]);
            keys.push(key);
        } else {
            group = groups[index][1];
        }
        group.push(value);
    });
    return groups;
};

GenericCollection.prototype.toArray = function () {
    return this.map(Function.identity);
};

// this depends on stringable keys, which apply to Array and Iterator
// because they have numeric keys and all Maps since they may use
// strings as keys.  List, Set, and SortedSet have nodes for keys, so
// toObject would not be meaningful.
GenericCollection.prototype.toObject = function () {
    var object = {};
    this.reduce(function (undefined, value, key) {
        object[key] = value;
    }, undefined);
    return object;
};

GenericCollection.prototype.filter = function (callback /*, thisp*/) {
    var thisp = arguments[1];
    var result = this.constructClone();
    this.reduce(function (undefined, value, key, object, depth) {
        if (callback.call(thisp, value, key, object, depth)) {
            result.add(value, key);
        }
    }, undefined);
    return result;
};

GenericCollection.prototype.every = function (callback /*, thisp*/) {
    var thisp = arguments[1];
    var iterator = this.iterate();
    while (true) {
        var iteration = iterator.next();
        if (iteration.done) {
            return true;
        } else if (!callback.call(thisp, iteration.value, iteration.index, this)) {
            return false;
        }
    }
};

GenericCollection.prototype.some = function (callback /*, thisp*/) {
    var thisp = arguments[1];
    var iterator = this.iterate();
    while (true) {
        var iteration = iterator.next();
        if (iteration.done) {
            return false;
        } else if (callback.call(thisp, iteration.value, iteration.index, this)) {
            return true;
        }
    }
};

GenericCollection.prototype.min = function (compare) {
    compare = compare || this.contentCompare || Object.compare;
    var first = true;
    return this.reduce(function (result, value) {
        if (first) {
            first = false;
            return value;
        } else {
            return compare(value, result) < 0 ? value : result;
        }
    }, undefined);
};

GenericCollection.prototype.max = function (compare) {
    compare = compare || this.contentCompare || Object.compare;
    var first = true;
    return this.reduce(function (result, value) {
        if (first) {
            first = false;
            return value;
        } else {
            return compare(value, result) > 0 ? value : result;
        }
    }, undefined);
};

GenericCollection.prototype.sum = function (zero) {
    zero = zero === undefined ? 0 : zero;
    return this.reduce(function (a, b) {
        return a + b;
    }, zero);
};

GenericCollection.prototype.average = function (zero) {
    var sum = zero === undefined ? 0 : zero;
    var count = zero === undefined ? 0 : zero;
    this.reduce(function (undefined, value) {
        sum += value;
        count += 1;
    }, undefined);
    return sum / count;
};

GenericCollection.prototype.concat = function () {
    var result = this.constructClone(this);
    for (var i = 0; i < arguments.length; i++) {
        result.addEach(arguments[i]);
    }
    return result;
};

GenericCollection.prototype.flatten = function () {
    var self = this;
    return this.reduce(function (result, array) {
        array.forEach(function (value) {
            this.push(value);
        }, result, self);
        return result;
    }, []);
};

GenericCollection.prototype.zip = function () {
    var table = Array.prototype.slice.call(arguments);
    table.unshift(this);
    return Array.unzip(table);
}

GenericCollection.prototype.join = function (delimiter) {
    return this.reduce(function (result, string) {
        return result + delimiter + string;
    });
};

GenericCollection.prototype.sorted = function (compare, by, order) {
    compare = compare || this.contentCompare || Object.compare;
    // account for comparators generated by Function.by
    if (compare.by) {
        by = compare.by;
        compare = compare.compare || this.contentCompare || Object.compare;
    } else {
        by = by || Function.identity;
    }
    if (order === undefined)
        order = 1;
    return this.map(function (item) {
        return {
            by: by(item),
            value: item
        };
    })
    .sort(function (a, b) {
        return compare(a.by, b.by) * order;
    })
    .map(function (pair) {
        return pair.value;
    });
};

GenericCollection.prototype.reversed = function () {
    return this.constructClone(this).reverse();
};

GenericCollection.prototype.clone = function (depth, memo) {
    if (depth === undefined) {
        depth = Infinity;
    } else if (depth === 0) {
        return this;
    }
    var clone = this.constructClone();
    this.forEach(function (value, key) {
        clone.add(Object.clone(value, depth - 1, memo), key);
    }, this);
    return clone;
};

GenericCollection.prototype.only = function () {
    if (this.length === 1) {
        return this.one();
    }
};

require("./shim-array");


}],["generic-order.js","collections","generic-order.js",{"./shim-object":8},function (require, exports, module, __filename, __dirname){

// collections/generic-order.js
// ----------------------------


var Object = require("./shim-object");

module.exports = GenericOrder;
function GenericOrder() {
    throw new Error("Can't construct. GenericOrder is a mixin.");
}

GenericOrder.prototype.equals = function (that, equals) {
    equals = equals || this.contentEquals || Object.equals;

    if (this === that) {
        return true;
    }
    if (!that) {
        return false;
    }

    var self = this;
    return (
        this.length === that.length &&
        this.zip(that).every(function (pair) {
            return equals(pair[0], pair[1]);
        })
    );
};

GenericOrder.prototype.compare = function (that, compare) {
    compare = compare || this.contentCompare || Object.compare;

    if (this === that) {
        return 0;
    }
    if (!that) {
        return 1;
    }

    var length = Math.min(this.length, that.length);
    var comparison = this.zip(that).reduce(function (comparison, pair, index) {
        if (comparison === 0) {
            if (index >= length) {
                return comparison;
            } else {
                return compare(pair[0], pair[1]);
            }
        } else {
            return comparison;
        }
    }, 0);
    if (comparison === 0) {
        return this.length - that.length;
    }
    return comparison;
};


}],["iterator.js","collections","iterator.js",{"./weak-map":9,"./generic-collection":3},function (require, exports, module, __filename, __dirname){

// collections/iterator.js
// -----------------------

"use strict";

module.exports = Iterator;

var WeakMap = require("./weak-map");
var GenericCollection = require("./generic-collection");

// upgrades an iterable to a Iterator
function Iterator(iterable, start, stop, step) {
    if (!iterable) {
        return Iterator.empty;
    } else if (iterable instanceof Iterator) {
        return iterable;
    } else if (!(this instanceof Iterator)) {
        return new Iterator(iterable, start, stop, step);
    } else if (Array.isArray(iterable) || typeof iterable === "string") {
        iterators.set(this, new IndexIterator(iterable, start, stop, step));
        return;
    }
    iterable = Object(iterable);
    if (iterable.next) {
        iterators.set(this, iterable);
    } else if (iterable.iterate) {
        iterators.set(this, iterable.iterate(start, stop, step));
    } else if (Object.prototype.toString.call(iterable) === "[object Function]") {
        this.next = iterable;
    } else {
        throw new TypeError("Can't iterate " + iterable);
    }
}

// Using iterators as a hidden table associating a full-fledged Iterator with
// an underlying, usually merely "nextable", iterator.
var iterators = new WeakMap();

// Selectively apply generic methods of GenericCollection
Iterator.prototype.forEach = GenericCollection.prototype.forEach;
Iterator.prototype.map = GenericCollection.prototype.map;
Iterator.prototype.filter = GenericCollection.prototype.filter;
Iterator.prototype.every = GenericCollection.prototype.every;
Iterator.prototype.some = GenericCollection.prototype.some;
Iterator.prototype.min = GenericCollection.prototype.min;
Iterator.prototype.max = GenericCollection.prototype.max;
Iterator.prototype.sum = GenericCollection.prototype.sum;
Iterator.prototype.average = GenericCollection.prototype.average;
Iterator.prototype.flatten = GenericCollection.prototype.flatten;
Iterator.prototype.zip = GenericCollection.prototype.zip;
Iterator.prototype.enumerate = GenericCollection.prototype.enumerate;
Iterator.prototype.sorted = GenericCollection.prototype.sorted;
Iterator.prototype.group = GenericCollection.prototype.group;
Iterator.prototype.reversed = GenericCollection.prototype.reversed;
Iterator.prototype.toArray = GenericCollection.prototype.toArray;
Iterator.prototype.toObject = GenericCollection.prototype.toObject;

// This is a bit of a cheat so flatten and such work with the generic reducible
Iterator.prototype.constructClone = function (values) {
    var clone = [];
    clone.addEach(values);
    return clone;
};

// A level of indirection so a full-interface iterator can proxy for a simple
// nextable iterator, and to allow the child iterator to replace its governing
// iterator, as with drop-while iterators.
Iterator.prototype.next = function () {
    var nextable = iterators.get(this);
    if (nextable) {
        return nextable.next();
    } else {
        return Iterator.done;
    }
};

Iterator.prototype.iterateMap = function (callback /*, thisp*/) {
    var self = Iterator(this),
        thisp = arguments[1];
    return new MapIterator(self, callback, thisp);
};

function MapIterator(iterator, callback, thisp) {
    this.iterator = iterator;
    this.callback = callback;
    this.thisp = thisp;
}

MapIterator.prototype = Object.create(Iterator.prototype);
MapIterator.prototype.constructor = MapIterator;

MapIterator.prototype.next = function () {
    var iteration = this.iterator.next();
    if (iteration.done) {
        return iteration;
    } else {
        return new Iteration(
            this.callback.call(
                this.thisp,
                iteration.value,
                iteration.index,
                this.iteration
            ),
            iteration.index
        );
    }
};

Iterator.prototype.iterateFilter = function (callback /*, thisp*/) {
    var self = Iterator(this),
        thisp = arguments[1],
        index = 0;

    return new FilterIterator(self, callback, thisp);
};

function FilterIterator(iterator, callback, thisp) {
    this.iterator = iterator;
    this.callback = callback;
    this.thisp = thisp;
}

FilterIterator.prototype = Object.create(Iterator.prototype);
FilterIterator.prototype.constructor = FilterIterator;

FilterIterator.prototype.next = function () {
    var iteration;
    while (true) {
        iteration = this.iterator.next();
        if (iteration.done || this.callback.call(
            this.thisp,
            iteration.value,
            iteration.index,
            this.iteration
        )) {
            return iteration;
        }
    }
};

Iterator.prototype.reduce = function (callback /*, initial, thisp*/) {
    var self = Iterator(this),
        result = arguments[1],
        thisp = arguments[2],
        iteration;

    // First iteration unrolled
    iteration = self.next();
    if (iteration.done) {
        if (arguments.length > 1) {
            return arguments[1];
        } else {
            throw TypeError("Reduce of empty iterator with no initial value");
        }
    } else if (arguments.length > 1) {
        result = callback.call(
            thisp,
            result,
            iteration.value,
            iteration.index,
            self
        );
    } else {
        result = iteration.value;
    }

    // Remaining entries
    while (true) {
        iteration = self.next();
        if (iteration.done) {
            return result;
        } else {
            result = callback.call(
                thisp,
                result,
                iteration.value,
                iteration.index,
                self
            );
        }
    }
};

Iterator.prototype.dropWhile = function (callback /*, thisp */) {
    var self = Iterator(this),
        thisp = arguments[1],
        iteration;

    while (true) {
        iteration = self.next();
        if (iteration.done) {
            return Iterator.empty;
        } else if (!callback.call(thisp, iteration.value, iteration.index, self)) {
            return new DropWhileIterator(iteration, self);
        }
    }
};

function DropWhileIterator(iteration, iterator) {
    this.iteration = iteration;
    this.iterator = iterator;
    this.parent = null;
}

DropWhileIterator.prototype = Object.create(Iterator.prototype);
DropWhileIterator.prototype.constructor = DropWhileIterator;

DropWhileIterator.prototype.next = function () {
    var result = this.iteration;
    if (result) {
        this.iteration = null;
        return result;
    } else {
        return this.iterator.next();
    }
};

Iterator.prototype.takeWhile = function (callback /*, thisp*/) {
    var self = Iterator(this),
        thisp = arguments[1];
    return new TakeWhileIterator(self, callback, thisp);
};

function TakeWhileIterator(iterator, callback, thisp) {
    this.iterator = iterator;
    this.callback = callback;
    this.thisp = thisp;
}

TakeWhileIterator.prototype = Object.create(Iterator.prototype);
TakeWhileIterator.prototype.constructor = TakeWhileIterator;

TakeWhileIterator.prototype.next = function () {
    var iteration = this.iterator.next();
    if (iteration.done) {
        return iteration;
    } else if (this.callback.call(
        this.thisp,
        iteration.value,
        iteration.index,
        this.iterator
    )) {
        return iteration;
    } else {
        return Iterator.done;
    }
};

Iterator.prototype.iterateZip = function () {
    return Iterator.unzip(Array.prototype.concat.apply(this, arguments));
};

Iterator.prototype.iterateUnzip = function () {
    return Iterator.unzip(this);
};

Iterator.prototype.iterateEnumerate = function (start) {
    return Iterator.count(start).iterateZip(this);
};

Iterator.prototype.iterateConcat = function () {
    return Iterator.flatten(Array.prototype.concat.apply(this, arguments));
};

Iterator.prototype.iterateFlatten = function () {
    return Iterator.flatten(this);
};

Iterator.prototype.recount = function (start) {
    return new RecountIterator(this, start);
};

function RecountIterator(iterator, start) {
    this.iterator = iterator;
    this.index = start || 0;
}

RecountIterator.prototype = Object.create(Iterator.prototype);
RecountIterator.prototype.constructor = RecountIterator;

RecountIterator.prototype.next = function () {
    var iteration = this.iterator.next();
    if (iteration.done) {
        return iteration;
    } else {
        return new Iteration(
            iteration.value,
            this.index++
        );
    }
};

// creates an iterator for Array and String
function IndexIterator(iterable, start, stop, step) {
    if (step == null) {
        step = 1;
    }
    if (stop == null) {
        stop = start;
        start = 0;
    }
    if (start == null) {
        start = 0;
    }
    if (step == null) {
        step = 1;
    }
    if (stop == null) {
        stop = iterable.length;
    }
    this.iterable = iterable;
    this.start = start;
    this.stop = stop;
    this.step = step;
}

IndexIterator.prototype.next = function () {
    // Advance to next owned entry
    if (typeof this.iterable === "object") { // as opposed to string
        while (!(this.start in this.iterable)) {
            if (this.start >= this.stop) {
                return Iterator.done;
            } else {
                this.start += this.step;
            }
        }
    }
    if (this.start >= this.stop) { // end of string
        return Iterator.done;
    }
    var iteration = new Iteration(
        this.iterable[this.start],
        this.start
    );
    this.start += this.step;
    return iteration;
};

Iterator.cycle = function (cycle, times) {
    if (arguments.length < 2) {
        times = Infinity;
    }
    return new CycleIterator(cycle, times);
};

function CycleIterator(cycle, times) {
    this.cycle = cycle;
    this.times = times;
    this.iterator = Iterator.empty;
}

CycleIterator.prototype = Object.create(Iterator.prototype);
CycleIterator.prototype.constructor = CycleIterator;

CycleIterator.prototype.next = function () {
    var iteration = this.iterator.next();
    if (iteration.done) {
        if (this.times > 0) {
            this.times--;
            this.iterator = new Iterator(this.cycle);
            return this.iterator.next();
        } else {
            return iteration;
        }
    } else {
        return iteration;
    }
};

Iterator.concat = function (/* ...iterators */) {
    return Iterator.flatten(Array.prototype.slice.call(arguments));
};

Iterator.flatten = function (iterators) {
    iterators = Iterator(iterators);
    return new ChainIterator(iterators);
};

function ChainIterator(iterators) {
    this.iterators = iterators;
    this.iterator = Iterator.empty;
}

ChainIterator.prototype = Object.create(Iterator.prototype);
ChainIterator.prototype.constructor = ChainIterator;

ChainIterator.prototype.next = function () {
    var iteration = this.iterator.next();
    if (iteration.done) {
        var iteratorIteration = this.iterators.next();
        if (iteratorIteration.done) {
            return Iterator.done;
        } else {
            this.iterator = new Iterator(iteratorIteration.value);
            return this.iterator.next();
        }
    } else {
        return iteration;
    }
};

Iterator.unzip = function (iterators) {
    iterators = Iterator(iterators).map(Iterator);
    if (iterators.length === 0)
        return new Iterator.empty;
    return new UnzipIterator(iterators);
};

function UnzipIterator(iterators) {
    this.iterators = iterators;
    this.index = 0;
}

UnzipIterator.prototype = Object.create(Iterator.prototype);
UnzipIterator.prototype.constructor = UnzipIterator;

UnzipIterator.prototype.next = function () {
    var done = false
    var result = this.iterators.map(function (iterator) {
        var iteration = iterator.next();
        if (iteration.done) {
            done = true;
        } else {
            return iteration.value;
        }
    });
    if (done) {
        return Iterator.done;
    } else {
        return new Iteration(result, this.index++);
    }
};

Iterator.zip = function () {
    return Iterator.unzip(Array.prototype.slice.call(arguments));
};

Iterator.range = function (start, stop, step) {
    if (arguments.length < 3) {
        step = 1;
    }
    if (arguments.length < 2) {
        stop = start;
        start = 0;
    }
    start = start || 0;
    step = step || 1;
    return new RangeIterator(start, stop, step);
};

Iterator.count = function (start, step) {
    return Iterator.range(start, Infinity, step);
};

function RangeIterator(start, stop, step) {
    this.start = start;
    this.stop = stop;
    this.step = step;
    this.index = 0;
}

RangeIterator.prototype = Object.create(Iterator.prototype);
RangeIterator.prototype.constructor = RangeIterator;

RangeIterator.prototype.next = function () {
    if (this.start >= this.stop) {
        return Iterator.done;
    } else {
        var result = this.start;
        this.start += this.step;
        return new Iteration(result, this.index++);
    }
};

Iterator.repeat = function (value, times) {
    if (times == null) {
        times = Infinity;
    }
    return new RepeatIterator(value, times);
};

function RepeatIterator(value, times) {
    this.value = value;
    this.times = times;
    this.index = 0;
}

RepeatIterator.prototype = Object.create(Iterator.prototype);
RepeatIterator.prototype.constructor = RepeatIterator;

RepeatIterator.prototype.next = function () {
    if (this.index < this.times) {
        return new Iteration(this.value, this.index++);
    } else {
        return Iterator.done;
    }
};

Iterator.enumerate = function (values, start) {
    return Iterator.count(start).iterateZip(new Iterator(values));
};

function EmptyIterator() {}

EmptyIterator.prototype = Object.create(Iterator.prototype);
EmptyIterator.prototype.constructor = EmptyIterator;

EmptyIterator.prototype.next = function () {
    return Iterator.done;
};

Iterator.empty = new EmptyIterator();

// Iteration and DoneIteration exist here only to encourage hidden classes.
// Otherwise, iterations are merely duck-types.

function Iteration(value, index) {
    this.value = value;
    this.index = index;
}

Iteration.prototype.done = false;

Iteration.prototype.equals = function (that, equals, memo) {
    if (!that) return false;
    return (
        equals(this.value, that.value, equals, memo) &&
        this.index === that.index &&
        this.done === that.done
    );

};

function DoneIteration(value) {
    Iteration.call(this, value);
    this.done = true; // reflected on the instance to make it more obvious
}

DoneIteration.prototype = Object.create(Iteration.prototype);
DoneIteration.prototype.constructor = DoneIteration;
DoneIteration.prototype.done = true;

Iterator.Iteration = Iteration;
Iterator.DoneIteration = DoneIteration;
Iterator.done = new DoneIteration();


}],["shim-array.js","collections","shim-array.js",{"./shim-function":7,"./generic-collection":3,"./generic-order":4,"./iterator":5,"weak-map":55},function (require, exports, module, __filename, __dirname){

// collections/shim-array.js
// -------------------------

"use strict";

/*
    Based in part on extras from Motorola Mobility’s Montage
    Copyright (c) 2012, Motorola Mobility LLC. All Rights Reserved.
    3-Clause BSD License
    https://github.com/motorola-mobility/montage/blob/master/LICENSE.md
*/

var Function = require("./shim-function");
var GenericCollection = require("./generic-collection");
var GenericOrder = require("./generic-order");
var Iterator = require("./iterator");
var WeakMap = require("weak-map");

module.exports = Array;

var array_splice = Array.prototype.splice;
var array_slice = Array.prototype.slice;

Array.empty = [];

if (Object.freeze) {
    Object.freeze(Array.empty);
}

Array.from = function (values) {
    var array = [];
    array.addEach(values);
    return array;
};

Array.unzip = function (table) {
    var transpose = [];
    var length = Infinity;
    // compute shortest row
    for (var i = 0; i < table.length; i++) {
        var row = table[i];
        table[i] = row.toArray();
        if (row.length < length) {
            length = row.length;
        }
    }
    for (var i = 0; i < table.length; i++) {
        var row = table[i];
        for (var j = 0; j < row.length; j++) {
            if (j < length && j in row) {
                transpose[j] = transpose[j] || [];
                transpose[j][i] = row[j];
            }
        }
    }
    return transpose;
};

function define(key, value) {
    Object.defineProperty(Array.prototype, key, {
        value: value,
        writable: true,
        configurable: true,
        enumerable: false
    });
}

define("addEach", GenericCollection.prototype.addEach);
define("deleteEach", GenericCollection.prototype.deleteEach);
define("toArray", GenericCollection.prototype.toArray);
define("toObject", GenericCollection.prototype.toObject);
define("min", GenericCollection.prototype.min);
define("max", GenericCollection.prototype.max);
define("sum", GenericCollection.prototype.sum);
define("average", GenericCollection.prototype.average);
define("only", GenericCollection.prototype.only);
define("flatten", GenericCollection.prototype.flatten);
define("zip", GenericCollection.prototype.zip);
define("enumerate", GenericCollection.prototype.enumerate);
define("group", GenericCollection.prototype.group);
define("sorted", GenericCollection.prototype.sorted);
define("reversed", GenericCollection.prototype.reversed);

define("constructClone", function (values) {
    var clone = new this.constructor();
    clone.addEach(values);
    return clone;
});

define("has", function (value, equals) {
    return this.findValue(value, equals) !== -1;
});

define("get", function (index, defaultValue) {
    if (+index !== index)
        throw new Error("Indicies must be numbers");
    if (!index in this) {
        return defaultValue;
    } else {
        return this[index];
    }
});

define("set", function (index, value) {
    if (index < this.length) {
        this.splice(index, 1, value);
    } else {
        // Must use swap instead of splice, dispite the unfortunate array
        // argument, because splice would truncate index to length.
        this.swap(index, 1, [value]);
    }
    return this;
});

define("add", function (value) {
    this.push(value);
    return true;
});

define("delete", function (value, equals) {
    var index = this.findValue(value, equals);
    if (index !== -1) {
        this.splice(index, 1);
        return true;
    }
    return false;
});

define("findValue", function (value, equals) {
    equals = equals || this.contentEquals || Object.equals;
    for (var index = 0; index < this.length; index++) {
        if (index in this && equals(this[index], value)) {
            return index;
        }
    }
    return -1;
});

define("findLastValue", function (value, equals) {
    equals = equals || this.contentEquals || Object.equals;
    var index = this.length;
    do {
        index--;
        if (index in this && equals(this[index], value)) {
            return index;
        }
    } while (index > 0);
    return -1;
});

define("swap", function (start, minusLength, plus) {
    // Unrolled implementation into JavaScript for a couple reasons.
    // Calling splice can cause large stack sizes for large swaps. Also,
    // splice cannot handle array holes.
    if (plus) {
        if (!Array.isArray(plus)) {
            plus = array_slice.call(plus);
        }
    } else {
        plus = Array.empty;
    }

    if (start < 0) {
        start = this.length + start;
    } else if (start > this.length) {
        this.length = start;
    }

    if (start + minusLength > this.length) {
        // Truncate minus length if it extends beyond the length
        minusLength = this.length - start;
    } else if (minusLength < 0) {
        // It is the JavaScript way.
        minusLength = 0;
    }

    var diff = plus.length - minusLength;
    var oldLength = this.length;
    var newLength = this.length + diff;

    if (diff > 0) {
        // Head Tail Plus Minus
        // H H H H M M T T T T
        // H H H H P P P P T T T T
        //         ^ start
        //         ^-^ minus.length
        //           ^ --> diff
        //         ^-----^ plus.length
        //             ^------^ tail before
        //                 ^------^ tail after
        //                   ^ start iteration
        //                       ^ start iteration offset
        //             ^ end iteration
        //                 ^ end iteration offset
        //             ^ start + minus.length
        //                     ^ length
        //                   ^ length - 1
        for (var index = oldLength - 1; index >= start + minusLength; index--) {
            var offset = index + diff;
            if (index in this) {
                this[offset] = this[index];
            } else {
                // Oddly, PhantomJS complains about deleting array
                // properties, unless you assign undefined first.
                this[offset] = void 0;
                delete this[offset];
            }
        }
    }
    for (var index = 0; index < plus.length; index++) {
        if (index in plus) {
            this[start + index] = plus[index];
        } else {
            this[start + index] = void 0;
            delete this[start + index];
        }
    }
    if (diff < 0) {
        // Head Tail Plus Minus
        // H H H H M M M M T T T T
        // H H H H P P T T T T
        //         ^ start
        //         ^-----^ length
        //         ^-^ plus.length
        //             ^ start iteration
        //                 ^ offset start iteration
        //                     ^ end
        //                         ^ offset end
        //             ^ start + minus.length - plus.length
        //             ^ start - diff
        //                 ^------^ tail before
        //             ^------^ tail after
        //                     ^ length - diff
        //                     ^ newLength
        for (var index = start + plus.length; index < oldLength - diff; index++) {
            var offset = index - diff;
            if (offset in this) {
                this[index] = this[offset];
            } else {
                this[index] = void 0;
                delete this[index];
            }
        }
    }
    this.length = newLength;
});

define("peek", function () {
    return this[0];
});

define("poke", function (value) {
    if (this.length > 0) {
        this[0] = value;
    }
});

define("peekBack", function () {
    if (this.length > 0) {
        return this[this.length - 1];
    }
});

define("pokeBack", function (value) {
    if (this.length > 0) {
        this[this.length - 1] = value;
    }
});

define("one", function () {
    for (var i in this) {
        if (Object.owns(this, i)) {
            return this[i];
        }
    }
});

define("clear", function () {
    this.length = 0;
    return this;
});

define("compare", function (that, compare) {
    compare = compare || Object.compare;
    var i;
    var length;
    var lhs;
    var rhs;
    var relative;

    if (this === that) {
        return 0;
    }

    if (!that || !Array.isArray(that)) {
        return GenericOrder.prototype.compare.call(this, that, compare);
    }

    length = Math.min(this.length, that.length);

    for (i = 0; i < length; i++) {
        if (i in this) {
            if (!(i in that)) {
                return -1;
            } else {
                lhs = this[i];
                rhs = that[i];
                relative = compare(lhs, rhs);
                if (relative) {
                    return relative;
                }
            }
        } else if (i in that) {
            return 1;
        }
    }

    return this.length - that.length;
});

define("equals", function (that, equals, memo) {
    equals = equals || Object.equals;
    var i = 0;
    var length = this.length;
    var left;
    var right;

    if (this === that) {
        return true;
    }
    if (!that || !Array.isArray(that)) {
        return GenericOrder.prototype.equals.call(this, that);
    }

    if (length !== that.length) {
        return false;
    } else {
        for (; i < length; ++i) {
            if (i in this) {
                if (!(i in that)) {
                    return false;
                }
                left = this[i];
                right = that[i];
                if (!equals(left, right, equals, memo)) {
                    return false;
                }
            } else {
                if (i in that) {
                    return false;
                }
            }
        }
    }
    return true;
});

define("clone", function (depth, memo) {
    if (depth === undefined) {
        depth = Infinity;
    } else if (depth === 0) {
        return this;
    }
    memo = memo || new WeakMap();
    var clone = [];
    for (var i in this) {
        if (Object.owns(this, i)) {
            clone[i] = Object.clone(this[i], depth - 1, memo);
        }
    };
    return clone;
});

define("iterate", function (start, stop, step) {
    return new Iterator(this, start, stop, step);
});


}],["shim-function.js","collections","shim-function.js",{},function (require, exports, module, __filename, __dirname){

// collections/shim-function.js
// ----------------------------


module.exports = Function;

/**
    A utility to reduce unnecessary allocations of <code>function () {}</code>
    in its many colorful variations.  It does nothing and returns
    <code>undefined</code> thus makes a suitable default in some circumstances.

    @function external:Function.noop
*/
Function.noop = function () {
};

/**
    A utility to reduce unnecessary allocations of <code>function (x) {return
    x}</code> in its many colorful but ultimately wasteful parameter name
    variations.

    @function external:Function.identity
    @param {Any} any value
    @returns {Any} that value
*/
Function.identity = function (value) {
    return value;
};

/**
    A utility for creating a comparator function for a particular aspect of a
    figurative class of objects.

    @function external:Function.by
    @param {Function} relation A function that accepts a value and returns a
    corresponding value to use as a representative when sorting that object.
    @param {Function} compare an alternate comparator for comparing the
    represented values.  The default is <code>Object.compare</code>, which
    does a deep, type-sensitive, polymorphic comparison.
    @returns {Function} a comparator that has been annotated with
    <code>by</code> and <code>compare</code> properties so
    <code>sorted</code> can perform a transform that reduces the need to call
    <code>by</code> on each sorted object to just once.
 */
Function.by = function (by , compare) {
    compare = compare || Object.compare;
    by = by || Function.identity;
    var compareBy = function (a, b) {
        return compare(by(a), by(b));
    };
    compareBy.compare = compare;
    compareBy.by = by;
    return compareBy;
};

// TODO document
Function.get = function (key) {
    return function (object) {
        return Object.get(object, key);
    };
};


}],["shim-object.js","collections","shim-object.js",{"weak-map":55},function (require, exports, module, __filename, __dirname){

// collections/shim-object.js
// --------------------------

"use strict";

var WeakMap = require("weak-map");

module.exports = Object;

/*
    Based in part on extras from Motorola Mobility’s Montage
    Copyright (c) 2012, Motorola Mobility LLC. All Rights Reserved.
    3-Clause BSD License
    https://github.com/motorola-mobility/montage/blob/master/LICENSE.md
*/

/**
    Defines extensions to intrinsic <code>Object</code>.
    @see [Object class]{@link external:Object}
*/

/**
    A utility object to avoid unnecessary allocations of an empty object
    <code>{}</code>.  This object is frozen so it is safe to share.

    @object external:Object.empty
*/
Object.empty = Object.freeze(Object.create(null));

/**
    Returns whether the given value is an object, as opposed to a value.
    Unboxed numbers, strings, true, false, undefined, and null are not
    objects.  Arrays are objects.

    @function external:Object.isObject
    @param {Any} value
    @returns {Boolean} whether the given value is an object
*/
Object.isObject = function (object) {
    return Object(object) === object;
};

/**
    Returns the value of an any value, particularly objects that
    implement <code>valueOf</code>.

    <p>Note that, unlike the precedent of methods like
    <code>Object.equals</code> and <code>Object.compare</code> would suggest,
    this method is named <code>Object.getValueOf</code> instead of
    <code>valueOf</code>.  This is a delicate issue, but the basis of this
    decision is that the JavaScript runtime would be far more likely to
    accidentally call this method with no arguments, assuming that it would
    return the value of <code>Object</code> itself in various situations,
    whereas <code>Object.equals(Object, null)</code> protects against this case
    by noting that <code>Object</code> owns the <code>equals</code> property
    and therefore does not delegate to it.

    @function external:Object.getValueOf
    @param {Any} value a value or object wrapping a value
    @returns {Any} the primitive value of that object, if one exists, or passes
    the value through
*/
Object.getValueOf = function (value) {
    if (value && typeof value.valueOf === "function") {
        value = value.valueOf();
    }
    return value;
};

var hashMap = new WeakMap();
Object.hash = function (object) {
    if (object && typeof object.hash === "function") {
        return "" + object.hash();
    } else if (Object.isObject(object)) {
        if (!hashMap.has(object)) {
            hashMap.set(object, Math.random().toString(36).slice(2));
        }
        return hashMap.get(object);
    } else {
        return "" + object;
    }
};

/**
    A shorthand for <code>Object.prototype.hasOwnProperty.call(object,
    key)</code>.  Returns whether the object owns a property for the given key.
    It does not consult the prototype chain and works for any string (including
    "hasOwnProperty") except "__proto__".

    @function external:Object.owns
    @param {Object} object
    @param {String} key
    @returns {Boolean} whether the object owns a property wfor the given key.
*/
var owns = Object.prototype.hasOwnProperty;
Object.owns = function (object, key) {
    return owns.call(object, key);
};

/**
    A utility that is like Object.owns but is also useful for finding
    properties on the prototype chain, provided that they do not refer to
    methods on the Object prototype.  Works for all strings except "__proto__".

    <p>Alternately, you could use the "in" operator as long as the object
    descends from "null" instead of the Object.prototype, as with
    <code>Object.create(null)</code>.  However,
    <code>Object.create(null)</code> only works in fully compliant EcmaScript 5
    JavaScript engines and cannot be faithfully shimmed.

    <p>If the given object is an instance of a type that implements a method
    named "has", this function defers to the collection, so this method can be
    used to generically handle objects, arrays, or other collections.  In that
    case, the domain of the key depends on the instance.

    @param {Object} object
    @param {String} key
    @returns {Boolean} whether the object, or any of its prototypes except
    <code>Object.prototype</code>
    @function external:Object.has
*/
Object.has = function (object, key) {
    if (typeof object !== "object") {
        throw new Error("Object.has can't accept non-object: " + typeof object);
    }
    // forward to mapped collections that implement "has"
    if (object && typeof object.has === "function") {
        return object.has(key);
    // otherwise report whether the key is on the prototype chain,
    // as long as it is not one of the methods on object.prototype
    } else if (typeof key === "string") {
        return key in object && object[key] !== Object.prototype[key];
    } else {
        throw new Error("Key must be a string for Object.has on plain objects");
    }
};

/**
    Gets the value for a corresponding key from an object.

    <p>Uses Object.has to determine whether there is a corresponding value for
    the given key.  As such, <code>Object.get</code> is capable of retriving
    values from the prototype chain as long as they are not from the
    <code>Object.prototype</code>.

    <p>If there is no corresponding value, returns the given default, which may
    be <code>undefined</code>.

    <p>If the given object is an instance of a type that implements a method
    named "get", this function defers to the collection, so this method can be
    used to generically handle objects, arrays, or other collections.  In that
    case, the domain of the key depends on the implementation.  For a `Map`,
    for example, the key might be any object.

    @param {Object} object
    @param {String} key
    @param {Any} value a default to return, <code>undefined</code> if omitted
    @returns {Any} value for key, or default value
    @function external:Object.get
*/
Object.get = function (object, key, value) {
    if (typeof object !== "object") {
        throw new Error("Object.get can't accept non-object: " + typeof object);
    }
    // forward to mapped collections that implement "get"
    if (object && typeof object.get === "function") {
        return object.get(key, value);
    } else if (Object.has(object, key)) {
        return object[key];
    } else {
        return value;
    }
};

/**
    Sets the value for a given key on an object.

    <p>If the given object is an instance of a type that implements a method
    named "set", this function defers to the collection, so this method can be
    used to generically handle objects, arrays, or other collections.  As such,
    the key domain varies by the object type.

    @param {Object} object
    @param {String} key
    @param {Any} value
    @returns <code>undefined</code>
    @function external:Object.set
*/
Object.set = function (object, key, value) {
    if (object && typeof object.set === "function") {
        object.set(key, value);
    } else {
        object[key] = value;
    }
};

Object.addEach = function (target, source) {
    if (!source) {
    } else if (typeof source.forEach === "function" && !source.hasOwnProperty("forEach")) {
        // copy map-alikes
        if (typeof source.keys === "function") {
            source.forEach(function (value, key) {
                target[key] = value;
            });
        // iterate key value pairs of other iterables
        } else {
            source.forEach(function (pair) {
                target[pair[0]] = pair[1];
            });
        }
    } else {
        // copy other objects as map-alikes
        Object.keys(source).forEach(function (key) {
            target[key] = source[key];
        });
    }
    return target;
};

/**
    Iterates over the owned properties of an object.

    @function external:Object.forEach
    @param {Object} object an object to iterate.
    @param {Function} callback a function to call for every key and value
    pair in the object.  Receives <code>value</code>, <code>key</code>,
    and <code>object</code> as arguments.
    @param {Object} thisp the <code>this</code> to pass through to the
    callback
*/
Object.forEach = function (object, callback, thisp) {
    Object.keys(object).forEach(function (key) {
        callback.call(thisp, object[key], key, object);
    });
};

/**
    Iterates over the owned properties of a map, constructing a new array of
    mapped values.

    @function external:Object.map
    @param {Object} object an object to iterate.
    @param {Function} callback a function to call for every key and value
    pair in the object.  Receives <code>value</code>, <code>key</code>,
    and <code>object</code> as arguments.
    @param {Object} thisp the <code>this</code> to pass through to the
    callback
    @returns {Array} the respective values returned by the callback for each
    item in the object.
*/
Object.map = function (object, callback, thisp) {
    return Object.keys(object).map(function (key) {
        return callback.call(thisp, object[key], key, object);
    });
};

/**
    Returns the values for owned properties of an object.

    @function external:Object.map
    @param {Object} object
    @returns {Array} the respective value for each owned property of the
    object.
*/
Object.values = function (object) {
    return Object.map(object, Function.identity);
};

// TODO inline document concat
Object.concat = function () {
    var object = {};
    for (var i = 0; i < arguments.length; i++) {
        Object.addEach(object, arguments[i]);
    }
    return object;
};

Object.from = Object.concat;

/**
    Returns whether two values are identical.  Any value is identical to itself
    and only itself.  This is much more restictive than equivalence and subtly
    different than strict equality, <code>===</code> because of edge cases
    including negative zero and <code>NaN</code>.  Identity is useful for
    resolving collisions among keys in a mapping where the domain is any value.
    This method does not delgate to any method on an object and cannot be
    overridden.
    @see http://wiki.ecmascript.org/doku.php?id=harmony:egal
    @param {Any} this
    @param {Any} that
    @returns {Boolean} whether this and that are identical
    @function external:Object.is
*/
Object.is = function (x, y) {
    if (x === y) {
        // 0 === -0, but they are not identical
        return x !== 0 || 1 / x === 1 / y;
    }
    // NaN !== NaN, but they are identical.
    // NaNs are the only non-reflexive value, i.e., if x !== x,
    // then x is a NaN.
    // isNaN is broken: it converts its argument to number, so
    // isNaN("foo") => true
    return x !== x && y !== y;
};

/**
    Performs a polymorphic, type-sensitive deep equivalence comparison of any
    two values.

    <p>As a basic principle, any value is equivalent to itself (as in
    identity), any boxed version of itself (as a <code>new Number(10)</code> is
    to 10), and any deep clone of itself.

    <p>Equivalence has the following properties:

    <ul>
        <li><strong>polymorphic:</strong>
            If the given object is an instance of a type that implements a
            methods named "equals", this function defers to the method.  So,
            this function can safely compare any values regardless of type,
            including undefined, null, numbers, strings, any pair of objects
            where either implements "equals", or object literals that may even
            contain an "equals" key.
        <li><strong>type-sensitive:</strong>
            Incomparable types are not equal.  No object is equivalent to any
            array.  No string is equal to any other number.
        <li><strong>deep:</strong>
            Collections with equivalent content are equivalent, recursively.
        <li><strong>equivalence:</strong>
            Identical values and objects are equivalent, but so are collections
            that contain equivalent content.  Whether order is important varies
            by type.  For Arrays and lists, order is important.  For Objects,
            maps, and sets, order is not important.  Boxed objects are mutally
            equivalent with their unboxed values, by virtue of the standard
            <code>valueOf</code> method.
    </ul>
    @param this
    @param that
    @returns {Boolean} whether the values are deeply equivalent
    @function external:Object.equals
*/
Object.equals = function (a, b, equals, memo) {
    equals = equals || Object.equals;
    // unbox objects, but do not confuse object literals
    a = Object.getValueOf(a);
    b = Object.getValueOf(b);
    if (a === b)
        return true;
    if (Object.isObject(a)) {
        memo = memo || new WeakMap();
        if (memo.has(a)) {
            return true;
        }
        memo.set(a, true);
    }
    if (Object.isObject(a) && typeof a.equals === "function") {
        return a.equals(b, equals, memo);
    }
    // commutative
    if (Object.isObject(b) && typeof b.equals === "function") {
        return b.equals(a, equals, memo);
    }
    if (Object.isObject(a) && Object.isObject(b)) {
        if (Object.getPrototypeOf(a) === Object.prototype && Object.getPrototypeOf(b) === Object.prototype) {
            for (var name in a) {
                if (!equals(a[name], b[name], equals, memo)) {
                    return false;
                }
            }
            for (var name in b) {
                if (!(name in a) || !equals(b[name], a[name], equals, memo)) {
                    return false;
                }
            }
            return true;
        }
    }
    // NaN !== NaN, but they are equal.
    // NaNs are the only non-reflexive value, i.e., if x !== x,
    // then x is a NaN.
    // isNaN is broken: it converts its argument to number, so
    // isNaN("foo") => true
    // We have established that a !== b, but if a !== a && b !== b, they are
    // both NaN.
    if (a !== a && b !== b)
        return true;
    if (!a || !b)
        return a === b;
    return false;
};

// Because a return value of 0 from a `compare` function  may mean either
// "equals" or "is incomparable", `equals` cannot be defined in terms of
// `compare`.  However, `compare` *can* be defined in terms of `equals` and
// `lessThan`.  Again however, more often it would be desirable to implement
// all of the comparison functions in terms of compare rather than the other
// way around.

/**
    Determines the order in which any two objects should be sorted by returning
    a number that has an analogous relationship to zero as the left value to
    the right.  That is, if the left is "less than" the right, the returned
    value will be "less than" zero, where "less than" may be any other
    transitive relationship.

    <p>Arrays are compared by the first diverging values, or by length.

    <p>Any two values that are incomparable return zero.  As such,
    <code>equals</code> should not be implemented with <code>compare</code>
    since incomparability is indistinguishable from equality.

    <p>Sorts strings lexicographically.  This is not suitable for any
    particular international setting.  Different locales sort their phone books
    in very different ways, particularly regarding diacritics and ligatures.

    <p>If the given object is an instance of a type that implements a method
    named "compare", this function defers to the instance.  The method does not
    need to be an owned property to distinguish it from an object literal since
    object literals are incomparable.  Unlike <code>Object</code> however,
    <code>Array</code> implements <code>compare</code>.

    @param {Any} left
    @param {Any} right
    @returns {Number} a value having the same transitive relationship to zero
    as the left and right values.
    @function external:Object.compare
*/
Object.compare = function (a, b) {
    // unbox objects, but do not confuse object literals
    // mercifully handles the Date case
    a = Object.getValueOf(a);
    b = Object.getValueOf(b);
    if (a === b)
        return 0;
    var aType = typeof a;
    var bType = typeof b;
    if (aType === "number" && bType === "number")
        return a - b;
    if (aType === "string" && bType === "string")
        return a < b ? -Infinity : Infinity;
        // the possibility of equality elimiated above
    if (a && typeof a.compare === "function")
        return a.compare(b);
    // not commutative, the relationship is reversed
    if (b && typeof b.compare === "function")
        return -b.compare(a);
    return 0;
};

/**
    Creates a deep copy of any value.  Values, being immutable, are
    returned without alternation.  Forwards to <code>clone</code> on
    objects and arrays.

    @function external:Object.clone
    @param {Any} value a value to clone
    @param {Number} depth an optional traversal depth, defaults to infinity.
    A value of <code>0</code> means to make no clone and return the value
    directly.
    @param {Map} memo an optional memo of already visited objects to preserve
    reference cycles.  The cloned object will have the exact same shape as the
    original, but no identical objects.  Te map may be later used to associate
    all objects in the original object graph with their corresponding member of
    the cloned graph.
    @returns a copy of the value
*/
Object.clone = function (value, depth, memo) {
    value = Object.getValueOf(value);
    memo = memo || new WeakMap();
    if (depth === undefined) {
        depth = Infinity;
    } else if (depth === 0) {
        return value;
    }
    if (typeof value === "function") {
        return value;
    } else if (Object.isObject(value)) {
        if (!memo.has(value)) {
            if (value && typeof value.clone === "function") {
                memo.set(value, value.clone(depth, memo));
            } else {
                var prototype = Object.getPrototypeOf(value);
                if (prototype === null || prototype === Object.prototype) {
                    var clone = Object.create(prototype);
                    memo.set(value, clone);
                    for (var key in value) {
                        clone[key] = Object.clone(value[key], depth - 1, memo);
                    }
                } else {
                    throw new Error("Can't clone " + value);
                }
            }
        }
        return memo.get(value);
    }
    return value;
};

/**
    Removes all properties owned by this object making the object suitable for
    reuse.

    @function external:Object.clear
    @returns this
*/
Object.clear = function (object) {
    if (object && typeof object.clear === "function") {
        object.clear();
    } else {
        var keys = Object.keys(object),
            i = keys.length;
        while (i) {
            i--;
            delete object[keys[i]];
        }
    }
    return object;
};


}],["weak-map.js","collections","weak-map.js",{"weak-map":55},function (require, exports, module, __filename, __dirname){

// collections/weak-map.js
// -----------------------

module.exports = require("weak-map");

}],["broadcast.html","gtor-demos","broadcast.html",{"./broadcast":11,"./lanes.html":14},function (require, exports, module, __filename, __dirname){

// gtor-demos/broadcast.html
// -------------------------

"use strict";
var $SUPER = require("./broadcast");
var $LANES = require("./lanes.html");
var $THIS = function GtordemosBroadcast(body, caller) {
    $SUPER.apply(this, arguments);
    var document = body.ownerDocument;
    var scope = this.scope = caller.root.nestComponents();
    scope.caller = caller;
    scope.this = this;
    var parent = body, parents = [], node, component, callee, argument;
    node = document.createBody();
    parent.appendChild(node);
    parents[parents.length] = parent; parent = node;
    // LANES
        node = {tagName: "lanes"};
        node.children = {};
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "source";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "fork(3)";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "1s";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "2s";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "3s";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        callee = scope.nest();
        callee.argument = node;
        callee.id = "lanes";
        component = new $LANES(parent, callee);
    node = parent; parent = parents[parents.length - 1]; parents.length--;
    scope.set("lanes", component);
    this.scope.set("this", this);
};
$THIS.prototype = Object.create($SUPER.prototype);
$THIS.prototype.constructor = $THIS;
$THIS.prototype.exports = {};
module.exports = $THIS;

}],["broadcast.js","gtor-demos","broadcast.js",{"ndim/point2":45,"collections/iterator":5,"gtor/stream":33,"gtor/promise":32,"gtor/promise-queue":31,"./item":13},function (require, exports, module, __filename, __dirname){

// gtor-demos/broadcast.js
// -----------------------

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

}],["index.js","gtor-demos","index.js",{"gutentag/document":37,"gutentag/scope":40,"blick":2,"./main.html":16},function (require, exports, module, __filename, __dirname){

// gtor-demos/index.js
// -------------------

"use strict";

var Document = require("gutentag/document");
var Scope = require("gutentag/scope");
var Animator = require("blick");
var Main = require("./main.html");

var scope = new Scope();
scope.animator = new Animator();
var document = new Document(window.document.body);
var main = new Main(document.documentElement, scope);

}],["item.js","gtor-demos","item.js",{"ndim/point2":45},function (require, exports, module, __filename, __dirname){

// gtor-demos/item.js
// ------------------

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
    this.element.style.zIndex = this.order;
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

}],["lanes.html","gtor-demos","lanes.html",{"./lanes":15,"gutentag/repeat.html":38,"gutentag/text.html":41},function (require, exports, module, __filename, __dirname){

// gtor-demos/lanes.html
// ---------------------

"use strict";
var $SUPER = require("./lanes");
var $REPEAT = require("gutentag/repeat.html");
var $TEXT = require("gutentag/text.html");
var $THIS = function GtordemosLanes(body, caller) {
    $SUPER.apply(this, arguments);
    var document = body.ownerDocument;
    var scope = this.scope = caller.root.nestComponents();
    scope.caller = caller;
    scope.this = this;
    var parent = body, parents = [], node, component, callee, argument;
    node = document.createElement("DIV");
    parent.appendChild(node);
    node.setAttribute("class", "box");
    parents[parents.length] = parent; parent = node;
    // DIV
        node = document.createBody();
        parent.appendChild(node);
        parents[parents.length] = parent; parent = node;
        // REPEAT
            node = {tagName: "repeat"};
            node.component = $THIS$0;
            callee = scope.nest();
            callee.argument = node;
            callee.id = "lanes";
            component = new $REPEAT(parent, callee);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        scope.set("lanes", component);
        node = document.createBody();
        parent.appendChild(node);
        parents[parents.length] = parent; parent = node;
        // REPEAT
            node = {tagName: "repeat"};
            node.component = $THIS$1;
            callee = scope.nest();
            callee.argument = node;
            callee.id = "items";
            component = new $REPEAT(parent, callee);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        scope.set("items", component);
    node = parent; parent = parents[parents.length - 1]; parents.length--;
    this.scope.set("this", this);
};
$THIS.prototype = Object.create($SUPER.prototype);
$THIS.prototype.constructor = $THIS;
$THIS.prototype.exports = {};
module.exports = $THIS;
var $THIS$0 = function GtordemosLanes$0(body, caller) {
    var document = body.ownerDocument;
    var scope = this.scope = caller;
    var parent = body, parents = [], node, component, callee, argument;
    node = document.createElement("DIV");
    parent.appendChild(node);
    component = node;
    scope.set("lane", component);
    node.setAttribute("class", "lane");
    parents[parents.length] = parent; parent = node;
    // DIV
        node = document.createElement("NOBR");
        parent.appendChild(node);
        parents[parents.length] = parent; parent = node;
        // NOBR
            node = document.createBody();
            parent.appendChild(node);
            parents[parents.length] = parent; parent = node;
            // TEXT
                node = {tagName: "text"};
                node.innerText = "—";
                callee = scope.nest();
                callee.argument = node;
                callee.id = "label";
                component = new $TEXT(parent, callee);
            node = parent; parent = parents[parents.length - 1]; parents.length--;
            scope.set("label", component);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
    node = parent; parent = parents[parents.length - 1]; parents.length--;
};
var $THIS$1 = function GtordemosLanes$1(body, caller) {
    var document = body.ownerDocument;
    var scope = this.scope = caller;
    var parent = body, parents = [], node, component, callee, argument;
    node = document.createElement("DIV");
    parent.appendChild(node);
    component = node;
    scope.set("item", component);
    node.setAttribute("class", "item");
    parents[parents.length] = parent; parent = node;
    // DIV
        node = document.createBody();
        parent.appendChild(node);
        parents[parents.length] = parent; parent = node;
        // TEXT
            node = {tagName: "text"};
            node.innerText = "—";
            callee = scope.nest();
            callee.argument = node;
            callee.id = "label";
            component = new $TEXT(parent, callee);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        scope.set("label", component);
    node = parent; parent = parents[parents.length - 1]; parents.length--;
};

}],["lanes.js","gtor-demos","lanes.js",{"ndim/point2":45,"collections/iterator":5,"gtor/stream":33,"gtor/promise":32,"gtor/promise-queue":31},function (require, exports, module, __filename, __dirname){

// gtor-demos/lanes.js
// -------------------

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
    this.offset = 20;
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
        scope.components.lane.actualNode.style.top = 0 + "px";
        scope.components.lane.actualNode.style.left = (25 + component.index * 100) + "px";
    } else if (id === "items:iteration") {
        var item = component.value;
        scope.components.label.value = item.value;
        item.element = scope.components.item.actualNode;
        item.animator = scope.animator.add(item);
        item.label = scope.components.label;
        item.lanes = this;
    }
};

}],["main.html","gtor-demos","main.html",{"./main":17,"gutentag/choose.html":35,"./broadcast.html":10,"./multicast.html":22,"./map.html":20,"./map-reduce.html":18,"./reduce.html":24},function (require, exports, module, __filename, __dirname){

// gtor-demos/main.html
// --------------------

"use strict";
var $SUPER = require("./main");
var $CHOOSE = require("gutentag/choose.html");
var $BROADCAST = require("./broadcast.html");
var $MULTICAST = require("./multicast.html");
var $MAP = require("./map.html");
var $MAP_REDUCE = require("./map-reduce.html");
var $REDUCE = require("./reduce.html");
var $THIS = function GtordemosMain(body, caller) {
    $SUPER.apply(this, arguments);
    var document = body.ownerDocument;
    var scope = this.scope = caller.root.nestComponents();
    scope.caller = caller;
    scope.this = this;
    var parent = body, parents = [], node, component, callee, argument;
    node = document.createBody();
    parent.appendChild(node);
    parents[parents.length] = parent; parent = node;
    // CHOOSE
        node = {tagName: "choose"};
        node.children = {};
        node.children["a"] = $THIS$0;
        node.children["b"] = $THIS$2;
        node.children["e"] = $THIS$4;
        node.children["d"] = $THIS$6;
        node.children["c"] = $THIS$8;
        callee = scope.nest();
        callee.argument = node;
        callee.id = "demos";
        component = new $CHOOSE(parent, callee);
    node = parent; parent = parents[parents.length - 1]; parents.length--;
    scope.set("demos", component);
    node = document.createElement("DIV");
    parent.appendChild(node);
    component = node;
    scope.set("menu", component);
    node.setAttribute("class", "menu");
    parents[parents.length] = parent; parent = node;
    // DIV
        parent.appendChild(document.createTextNode(" "));
        node = document.createElement("BUTTON");
        parent.appendChild(node);
        node.setAttribute("value", "a");
        parents[parents.length] = parent; parent = node;
        // BUTTON
            parent.appendChild(document.createTextNode("Fork"));
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parent.appendChild(document.createTextNode(" "));
        node = document.createElement("BUTTON");
        parent.appendChild(node);
        node.setAttribute("value", "b");
        parents[parents.length] = parent; parent = node;
        // BUTTON
            parent.appendChild(document.createTextNode("Share"));
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parent.appendChild(document.createTextNode(" "));
        node = document.createElement("BUTTON");
        parent.appendChild(node);
        node.setAttribute("value", "e");
        parents[parents.length] = parent; parent = node;
        // BUTTON
            parent.appendChild(document.createTextNode("Map"));
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parent.appendChild(document.createTextNode(" "));
        node = document.createElement("BUTTON");
        parent.appendChild(node);
        node.setAttribute("value", "d");
        parents[parents.length] = parent; parent = node;
        // BUTTON
            parent.appendChild(document.createTextNode("Reduce"));
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parent.appendChild(document.createTextNode(" "));
        node = document.createElement("BUTTON");
        parent.appendChild(node);
        node.setAttribute("value", "c");
        parents[parents.length] = parent; parent = node;
        // BUTTON
            parent.appendChild(document.createTextNode("Map/Reduce"));
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parent.appendChild(document.createTextNode(" "));
    node = parent; parent = parents[parents.length - 1]; parents.length--;
    this.scope.set("this", this);
};
$THIS.prototype = Object.create($SUPER.prototype);
$THIS.prototype.constructor = $THIS;
$THIS.prototype.exports = {};
module.exports = $THIS;
var $THIS$0 = function GtordemosMain$0(body, caller) {
    var document = body.ownerDocument;
    var scope = this.scope = caller;
    var parent = body, parents = [], node, component, callee, argument;
    node = document.createBody();
    parent.appendChild(node);
    parents[parents.length] = parent; parent = node;
    // BROADCAST
        node = {tagName: "broadcast"};
        node.component = $THIS$0$1;
        callee = scope.nest();
        callee.argument = node;
        callee.id = null;
        component = new $BROADCAST(parent, callee);
    node = parent; parent = parents[parents.length - 1]; parents.length--;
};
var $THIS$0$1 = function GtordemosMain$0$1(body, caller) {
    var document = body.ownerDocument;
    var scope = this.scope = caller;
};
var $THIS$2 = function GtordemosMain$2(body, caller) {
    var document = body.ownerDocument;
    var scope = this.scope = caller;
    var parent = body, parents = [], node, component, callee, argument;
    node = document.createBody();
    parent.appendChild(node);
    parents[parents.length] = parent; parent = node;
    // MULTICAST
        node = {tagName: "multicast"};
        node.component = $THIS$2$3;
        callee = scope.nest();
        callee.argument = node;
        callee.id = null;
        component = new $MULTICAST(parent, callee);
    node = parent; parent = parents[parents.length - 1]; parents.length--;
};
var $THIS$2$3 = function GtordemosMain$2$3(body, caller) {
    var document = body.ownerDocument;
    var scope = this.scope = caller;
};
var $THIS$4 = function GtordemosMain$4(body, caller) {
    var document = body.ownerDocument;
    var scope = this.scope = caller;
    var parent = body, parents = [], node, component, callee, argument;
    node = document.createBody();
    parent.appendChild(node);
    parents[parents.length] = parent; parent = node;
    // MAP
        node = {tagName: "map"};
        node.component = $THIS$4$5;
        callee = scope.nest();
        callee.argument = node;
        callee.id = null;
        component = new $MAP(parent, callee);
    node = parent; parent = parents[parents.length - 1]; parents.length--;
};
var $THIS$4$5 = function GtordemosMain$4$5(body, caller) {
    var document = body.ownerDocument;
    var scope = this.scope = caller;
};
var $THIS$6 = function GtordemosMain$6(body, caller) {
    var document = body.ownerDocument;
    var scope = this.scope = caller;
    var parent = body, parents = [], node, component, callee, argument;
    node = document.createBody();
    parent.appendChild(node);
    parents[parents.length] = parent; parent = node;
    // REDUCE
        node = {tagName: "reduce"};
        node.component = $THIS$6$7;
        callee = scope.nest();
        callee.argument = node;
        callee.id = null;
        component = new $REDUCE(parent, callee);
    node = parent; parent = parents[parents.length - 1]; parents.length--;
};
var $THIS$6$7 = function GtordemosMain$6$7(body, caller) {
    var document = body.ownerDocument;
    var scope = this.scope = caller;
};
var $THIS$8 = function GtordemosMain$8(body, caller) {
    var document = body.ownerDocument;
    var scope = this.scope = caller;
    var parent = body, parents = [], node, component, callee, argument;
    node = document.createBody();
    parent.appendChild(node);
    parents[parents.length] = parent; parent = node;
    // MAP-REDUCE
        node = {tagName: "map-reduce"};
        node.component = $THIS$8$9;
        callee = scope.nest();
        callee.argument = node;
        callee.id = null;
        component = new $MAP_REDUCE(parent, callee);
    node = parent; parent = parents[parents.length - 1]; parents.length--;
};
var $THIS$8$9 = function GtordemosMain$8$9(body, caller) {
    var document = body.ownerDocument;
    var scope = this.scope = caller;
};

}],["main.js","gtor-demos","main.js",{},function (require, exports, module, __filename, __dirname){

// gtor-demos/main.js
// ------------------

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

}],["map-reduce.html","gtor-demos","map-reduce.html",{"./map-reduce":19,"./lanes.html":14},function (require, exports, module, __filename, __dirname){

// gtor-demos/map-reduce.html
// --------------------------

"use strict";
var $SUPER = require("./map-reduce");
var $LANES = require("./lanes.html");
var $THIS = function GtordemosMapreduce(body, caller) {
    $SUPER.apply(this, arguments);
    var document = body.ownerDocument;
    var scope = this.scope = caller.root.nestComponents();
    scope.caller = caller;
    scope.this = this;
    var parent = body, parents = [], node, component, callee, argument;
    node = document.createBody();
    parent.appendChild(node);
    parents[parents.length] = parent; parent = node;
    // LANES
        node = {tagName: "lanes"};
        node.children = {};
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "map";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "reduce";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "a";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "b";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "not max";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "max";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        callee = scope.nest();
        callee.argument = node;
        callee.id = "lanes";
        component = new $LANES(parent, callee);
    node = parent; parent = parents[parents.length - 1]; parents.length--;
    scope.set("lanes", component);
    this.scope.set("this", this);
};
$THIS.prototype = Object.create($SUPER.prototype);
$THIS.prototype.constructor = $THIS;
$THIS.prototype.exports = {};
module.exports = $THIS;

}],["map-reduce.js","gtor-demos","map-reduce.js",{"ndim/point2":45,"collections/iterator":5,"gtor/stream":33,"gtor/task":34,"gtor/promise-queue":31,"./item":13},function (require, exports, module, __filename, __dirname){

// gtor-demos/map-reduce.js
// ------------------------

"use strict";

var Point2 = require("ndim/point2");
var Iterator = require("collections/iterator");
var Stream = require("gtor/stream");
var Task = require("gtor/task");
var PromiseQueue = require("gtor/promise-queue");
var Item = require("./item");

module.exports = MapReduce;

function MapReduce() {
}

MapReduce.prototype.add = function (component, id, scope) {
    if (id === "this") {
        this.lanes = scope.components.lanes;
        this.setup();
    }
};

MapReduce.prototype.setup = function () {
    var self = this;
    var lanes = self.lanes;

    Stream.from(Iterator.range(0, 200))
    .map(function (n) {
        var item = new Item(n, (Math.random() * 100) | 0);
        lanes.items.push(item);
        item.goToLane(0);
        return item;
    }, null, 10)
    .map(function (item) {
        item.transitionToLane(1);
        return Task.delay(Math.random() * 1000).thenReturn(item);
    }, null, 10)
    .reduce(function (a, b) {
        a.transitionToLane(2);
        b.transitionToLane(3);
        return Task.delay(Math.random() * 500 + 500)
        .then(function () {
            var temp;
            if (a.value < b.value) {
                temp = a;
                a = b;
                b = temp;
            }
            a.transitionToLane(1);
            b.transitionToLane(4);
            return Task.delay(500).thenReturn(a);
        });
    }, 4)
    .then(function (result) {
        result.transitionToLane(5);
    })
    .done();
}

}],["map.html","gtor-demos","map.html",{"./map":21,"./lanes.html":14},function (require, exports, module, __filename, __dirname){

// gtor-demos/map.html
// -------------------

"use strict";
var $SUPER = require("./map");
var $LANES = require("./lanes.html");
var $THIS = function GtordemosMap(body, caller) {
    $SUPER.apply(this, arguments);
    var document = body.ownerDocument;
    var scope = this.scope = caller.root.nestComponents();
    scope.caller = caller;
    scope.this = this;
    var parent = body, parents = [], node, component, callee, argument;
    node = document.createBody();
    parent.appendChild(node);
    parents[parents.length] = parent; parent = node;
    // LANES
        node = {tagName: "lanes"};
        node.children = {};
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "source";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "map 32";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "map 16";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "map 4";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "map 1";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "target";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        callee = scope.nest();
        callee.argument = node;
        callee.id = "lanes";
        component = new $LANES(parent, callee);
    node = parent; parent = parents[parents.length - 1]; parents.length--;
    scope.set("lanes", component);
    this.scope.set("this", this);
};
$THIS.prototype = Object.create($SUPER.prototype);
$THIS.prototype.constructor = $THIS;
$THIS.prototype.exports = {};
module.exports = $THIS;

}],["map.js","gtor-demos","map.js",{"ndim/point2":45,"collections/iterator":5,"gtor/stream":33,"gtor/task":34,"gtor/promise-queue":31,"./item":13},function (require, exports, module, __filename, __dirname){

// gtor-demos/map.js
// -----------------

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

}],["multicast.html","gtor-demos","multicast.html",{"./multicast":23,"./lanes.html":14},function (require, exports, module, __filename, __dirname){

// gtor-demos/multicast.html
// -------------------------

"use strict";
var $SUPER = require("./multicast");
var $LANES = require("./lanes.html");
var $THIS = function GtordemosMulticast(body, caller) {
    $SUPER.apply(this, arguments);
    var document = body.ownerDocument;
    var scope = this.scope = caller.root.nestComponents();
    scope.caller = caller;
    scope.this = this;
    var parent = body, parents = [], node, component, callee, argument;
    node = document.createBody();
    parent.appendChild(node);
    parents[parents.length] = parent; parent = node;
    // LANES
        node = {tagName: "lanes"};
        node.children = {};
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "source";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "1 @ 2/s";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "3 @ 1/s";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        callee = scope.nest();
        callee.argument = node;
        callee.id = "lanes";
        component = new $LANES(parent, callee);
    node = parent; parent = parents[parents.length - 1]; parents.length--;
    scope.set("lanes", component);
    this.scope.set("this", this);
};
$THIS.prototype = Object.create($SUPER.prototype);
$THIS.prototype.constructor = $THIS;
$THIS.prototype.exports = {};
module.exports = $THIS;

}],["multicast.js","gtor-demos","multicast.js",{"ndim/point2":45,"collections/iterator":5,"gtor/stream":33,"gtor/promise":32,"gtor/promise-queue":31,"./item":13},function (require, exports, module, __filename, __dirname){

// gtor-demos/multicast.js
// -----------------------

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
        var item = new Item(n, n);
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

}],["reduce.html","gtor-demos","reduce.html",{"./reduce":25,"./lanes.html":14},function (require, exports, module, __filename, __dirname){

// gtor-demos/reduce.html
// ----------------------

"use strict";
var $SUPER = require("./reduce");
var $LANES = require("./lanes.html");
var $THIS = function GtordemosReduce(body, caller) {
    $SUPER.apply(this, arguments);
    var document = body.ownerDocument;
    var scope = this.scope = caller.root.nestComponents();
    scope.caller = caller;
    scope.this = this;
    var parent = body, parents = [], node, component, callee, argument;
    node = document.createBody();
    parent.appendChild(node);
    parents[parents.length] = parent; parent = node;
    // LANES
        node = {tagName: "lanes"};
        node.children = {};
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "candidates";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "a";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "b";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "not max";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        parents[parents.length] = parent; parent = node;
        // LANE
            node = {tagName: "lane"};
            node.innerText = "max";
            parent.children["lane"] = parent.children["lane"] || [];
            parent.children["lane"].push(node);
        node = parent; parent = parents[parents.length - 1]; parents.length--;
        callee = scope.nest();
        callee.argument = node;
        callee.id = "lanes";
        component = new $LANES(parent, callee);
    node = parent; parent = parents[parents.length - 1]; parents.length--;
    scope.set("lanes", component);
    this.scope.set("this", this);
};
$THIS.prototype = Object.create($SUPER.prototype);
$THIS.prototype.constructor = $THIS;
$THIS.prototype.exports = {};
module.exports = $THIS;

}],["reduce.js","gtor-demos","reduce.js",{"ndim/point2":45,"collections/iterator":5,"gtor/stream":33,"gtor/task":34,"gtor/promise-queue":31,"./item":13},function (require, exports, module, __filename, __dirname){

// gtor-demos/reduce.js
// --------------------

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

}],["iteration.js","gtor","iteration.js",{},function (require, exports, module, __filename, __dirname){

// gtor/iteration.js
// -----------------

"use strict";

// ## Iteration
//
// Various methods of both synchronous and asynchronous iterators and
// generators transport iterations, which represent either a yielded value of
// an ongoing sequence or the return value of a sequence that has terminated.
// While object literals are sufficient to capture iterations, the iteration
// constructor is handy for readability and allows V8 at least to use a hidden
// class for all instances.

module.exports = Iteration;
function Iteration(value, done, index) {
    this.value = value;
    this.done = done;
    this.index = index;
}

// The Collections library operators, and therefore the Jasminum expectation
// operators, defer to the `equals` method of any object that implements it.
Iteration.prototype.equals = function (that, equals, memo) {
    if (!that) return false;
    return (
        equals(this.value, that.value, equals, memo) &&
        this.index === that.index &&
        this.done === that.done
    );

};

// The `done` iteration singleton suffices for many cases where a terminal
// iteration does not need to carry a return value.
// This singleton exists only to avoid unnecessarily allocating a new iteration
// for each of these cases.
Iteration.done = new Iteration(undefined, true, undefined);


}],["iterator.js","gtor","iterator.js",{"collections/weak-map":9,"collections/generic-collection":3,"./iteration":26},function (require, exports, module, __filename, __dirname){

// gtor/iterator.js
// ----------------

"use strict";

module.exports = Iterator;

var WeakMap = require("collections/weak-map");
var GenericCollection = require("collections/generic-collection");
var Iteration = require("./iteration");

// upgrades an iterable to a Iterator
function Iterator(iterable, start, stop, step) {
    if (!iterable) {
        return Iterator.empty;
    } else if (iterable instanceof Iterator) {
        return iterable;
    } else if (!(this instanceof Iterator)) {
        return new Iterator(iterable, start, stop, step);
    } else if (Array.isArray(iterable) || typeof iterable === "string") {
        handlers.set(this, new IndexIterator(iterable, start, stop, step));
        return;
    }
    iterable = Object(iterable);
    if (iterable.next) {
        handlers.set(this, iterable);
    } else if (iterable.iterate) {
        handlers.set(this, iterable.iterate(start, stop, step));
    } else if (Object.prototype.toString.call(iterable) === "[object Function]") {
        this.next = iterable;
    } else if (Object.getPrototypeOf(iterable) === Object.prototype) {
        handlers.set(this, new ObjectIterator(iterable));
    } else {
        throw new TypeError("Can't iterate " + iterable);
    }
}

Iterator.probe = function (callback, thisp) {
    return new Iterator(new Probe(callback, thisp));
};

function Probe(callback, thisp) {
    this.callback = callback;
    this.thisp = thisp;
}

Probe.prototype.next = function (value, index) {
    return this.callback.call(this.thisp, value, index);
};

// Using handlers as a hidden table associating a full-fledged Iterator with
// an underlying, usually merely "nextable", iterator.
var handlers = new WeakMap();

// Selectively apply generic methods of GenericCollection
Iterator.prototype.forEach = GenericCollection.prototype.forEach;
Iterator.prototype.map = GenericCollection.prototype.map;
Iterator.prototype.filter = GenericCollection.prototype.filter;
Iterator.prototype.every = GenericCollection.prototype.every;
Iterator.prototype.some = GenericCollection.prototype.some;
Iterator.prototype.min = GenericCollection.prototype.min;
Iterator.prototype.max = GenericCollection.prototype.max;
Iterator.prototype.sum = GenericCollection.prototype.sum;
Iterator.prototype.average = GenericCollection.prototype.average;
Iterator.prototype.flatten = GenericCollection.prototype.flatten;
Iterator.prototype.zip = GenericCollection.prototype.zip;
Iterator.prototype.enumerate = GenericCollection.prototype.enumerate;
Iterator.prototype.sorted = GenericCollection.prototype.sorted;
Iterator.prototype.group = GenericCollection.prototype.group;
Iterator.prototype.reversed = GenericCollection.prototype.reversed;
Iterator.prototype.toArray = GenericCollection.prototype.toArray;
Iterator.prototype.toObject = GenericCollection.prototype.toObject;

// This is a bit of a cheat so flatten and such work with the generic reducible
Iterator.prototype.constructClone = function (values) {
    var clone = [];
    clone.addEach(values);
    return clone;
};

// A level of indirection so a full-interface iterator can proxy for a simple
// nextable iterator.
Iterator.prototype.next = function (value, index) {
    var nextable = handlers.get(this);
    if (nextable) {
        return nextable.next(value, index);
    } else {
        return Iteration.done;
    }
};

Iterator.prototype.iterateMap = function (callback /*, thisp*/) {
    var self = Iterator(this),
        thisp = arguments[1];
    return new MapIterator(self, callback, thisp);
};

function MapIterator(iterator, callback, thisp) {
    this.iterator = iterator;
    this.callback = callback;
    this.thisp = thisp;
}

MapIterator.prototype = Object.create(Iterator.prototype);
MapIterator.prototype.constructor = MapIterator;

MapIterator.prototype.next = function (value, next) {
    var iteration = this.iterator.next(value, next);
    if (iteration.done) {
        return iteration;
    } else {
        return new Iteration(
            this.callback.call(
                this.thisp,
                iteration.value,
                iteration.index,
                this.iteration
            ),
            false,
            iteration.index
        );
    }
};

Iterator.prototype.iterateFilter = function (callback /*, thisp*/) {
    var self = Iterator(this),
        thisp = arguments[1],
        index = 0;

    return new FilterIterator(self, callback, thisp);
};

function FilterIterator(iterator, callback, thisp) {
    this.iterator = iterator;
    this.callback = callback;
    this.thisp = thisp;
}

FilterIterator.prototype = Object.create(Iterator.prototype);
FilterIterator.prototype.constructor = FilterIterator;

FilterIterator.prototype.next = function () {
    var iteration;
    while (true) {
        iteration = this.iterator.next();
        if (iteration.done || this.callback.call(
            this.thisp,
            iteration.value,
            iteration.index,
            this.iteration
        )) {
            return iteration;
        }
    }
};

Iterator.prototype.reduce = function (callback /*, initial, thisp*/) {
    var self = Iterator(this),
        result = arguments[1],
        thisp = arguments[2],
        iteration;

    // First iteration unrolled
    iteration = self.next();
    if (iteration.done) {
        if (arguments.length > 1) {
            return arguments[1];
        } else {
            throw TypeError("Reduce of empty iterator with no initial value");
        }
    } else if (arguments.length > 1) {
        result = callback.call(
            thisp,
            result,
            iteration.value,
            iteration.index,
            self
        );
    } else {
        result = iteration.value;
    }

    // Remaining entries
    while (true) {
        iteration = self.next();
        if (iteration.done) {
            return result;
        } else {
            result = callback.call(
                thisp,
                result,
                iteration.value,
                iteration.index,
                self
            );
        }
    }
};

Iterator.prototype.dropWhile = function (callback /*, thisp */) {
    var self = Iterator(this),
        thisp = arguments[1],
        iteration;

    while (true) {
        iteration = self.next();
        if (iteration.done) {
            return Iterator.empty;
        } else if (!callback.call(thisp, iteration.value, iteration.index, self)) {
            return new DropWhileIterator(iteration, self);
        }
    }
};

function DropWhileIterator(iteration, iterator) {
    this.iteration = iteration;
    this.iterator = iterator;
    this.parent = null;
}

DropWhileIterator.prototype = Object.create(Iterator.prototype);
DropWhileIterator.prototype.constructor = DropWhileIterator;

DropWhileIterator.prototype.next = function () {
    var result = this.iteration;
    if (result) {
        this.iteration = null;
        return result;
    } else {
        return this.iterator.next();
    }
};

Iterator.prototype.takeWhile = function (callback /*, thisp*/) {
    var self = Iterator(this),
        thisp = arguments[1];
    return new TakeWhileIterator(self, callback, thisp);
};

function TakeWhileIterator(iterator, callback, thisp) {
    this.iterator = iterator;
    this.callback = callback;
    this.thisp = thisp;
}

TakeWhileIterator.prototype = Object.create(Iterator.prototype);
TakeWhileIterator.prototype.constructor = TakeWhileIterator;

TakeWhileIterator.prototype.next = function () {
    var iteration = this.iterator.next();
    if (iteration.done) {
        return iteration;
    } else if (this.callback.call(
        this.thisp,
        iteration.value,
        iteration.index,
        this.iterator
    )) {
        return iteration;
    } else {
        return Iteration.done;
    }
};

Iterator.prototype.iterateZip = function () {
    return Iterator.unzip(Array.prototype.concat.apply(this, arguments));
};

Iterator.prototype.iterateUnzip = function () {
    return Iterator.unzip(this);
};

Iterator.prototype.iterateEnumerate = function (start) {
    return Iterator.count(start).iterateZip(this);
};

Iterator.prototype.iterateConcat = function () {
    return Iterator.flatten(Array.prototype.concat.apply(this, arguments));
};

Iterator.prototype.iterateFlatten = function () {
    return Iterator.flatten(this);
};

Iterator.prototype.recount = function (start) {
    return new RecountIterator(this, start);
};

function RecountIterator(iterator, start) {
    this.iterator = iterator;
    this.index = start || 0;
}

RecountIterator.prototype = Object.create(Iterator.prototype);
RecountIterator.prototype.constructor = RecountIterator;

RecountIterator.prototype.next = function () {
    var iteration = this.iterator.next();
    if (iteration.done) {
        return iteration;
    } else {
        return new Iteration(
            iteration.value,
            false,
            this.index++
        );
    }
};

// creates an iterator for Array and String
function IndexIterator(iterable, start, stop, step) {
    if (step == null) {
        step = 1;
    }
    if (stop == null) {
        stop = start;
        start = 0;
    }
    if (start == null) {
        start = 0;
    }
    if (step == null) {
        step = 1;
    }
    if (stop == null) {
        stop = iterable.length;
    }
    this.iterable = iterable;
    this.start = start;
    this.stop = stop;
    this.step = step;
}

IndexIterator.prototype.next = function () {
    // Advance to next owned entry
    if (typeof this.iterable === "object") { // as opposed to string
        while (!(this.start in this.iterable)) {
            if (this.start >= this.stop) {
                return Iteration.done;
            } else {
                this.start += this.step;
            }
        }
    }
    if (this.start >= this.stop) { // end of string
        return Iteration.done;
    }
    var iteration = new Iteration(
        this.iterable[this.start],
        false,
        this.start
    );
    this.start += this.step;
    return iteration;
};

function ObjectIterator(object) {
    this.object = object;
    this.iterator = new Iterator(Object.keys(object));
}

ObjectIterator.prototype.next = function () {
    var iteration = this.iterator.next();
    if (iteration.done) {
        return iteration;
    } else {
        var key = iteration.value;
        return new Iteration(this.object[key], false, key);
    }
};

Iterator.cycle = function (cycle, times) {
    if (arguments.length < 2) {
        times = Infinity;
    }
    return new CycleIterator(cycle, times);
};

function CycleIterator(cycle, times) {
    this.cycle = cycle;
    this.times = times;
    this.iterator = Iterator.empty;
}

CycleIterator.prototype = Object.create(Iterator.prototype);
CycleIterator.prototype.constructor = CycleIterator;

CycleIterator.prototype.next = function () {
    var iteration = this.iterator.next();
    if (iteration.done) {
        if (this.times > 0) {
            this.times--;
            this.iterator = new Iterator(this.cycle);
            return this.iterator.next();
        } else {
            return iteration;
        }
    } else {
        return iteration;
    }
};

Iterator.concat = function (/* ...iterators */) {
    return Iterator.flatten(Array.prototype.slice.call(arguments));
};

Iterator.flatten = function (iterators) {
    iterators = Iterator(iterators);
    return new ChainIterator(iterators);
};

function ChainIterator(iterators) {
    this.iterators = iterators;
    this.iterator = Iterator.empty;
}

ChainIterator.prototype = Object.create(Iterator.prototype);
ChainIterator.prototype.constructor = ChainIterator;

ChainIterator.prototype.next = function () {
    var iteration = this.iterator.next();
    if (iteration.done) {
        var iteratorIteration = this.iterators.next();
        if (iteratorIteration.done) {
            return Iteration.done;
        } else {
            this.iterator = new Iterator(iteratorIteration.value);
            return this.iterator.next();
        }
    } else {
        return iteration;
    }
};

Iterator.unzip = function (iterators) {
    iterators = Iterator(iterators).map(Iterator);
    if (iterators.length === 0)
        return new Iterator.empty;
    return new UnzipIterator(iterators);
};

function UnzipIterator(iterators) {
    this.iterators = iterators;
    this.index = 0;
}

UnzipIterator.prototype = Object.create(Iterator.prototype);
UnzipIterator.prototype.constructor = UnzipIterator;

UnzipIterator.prototype.next = function () {
    var done = false
    var result = this.iterators.map(function (iterator) {
        var iteration = iterator.next();
        if (iteration.done) {
            done = true;
        } else {
            return iteration.value;
        }
    });
    if (done) {
        return Iteration.done;
    } else {
        return new Iteration(result, false, this.index++);
    }
};

Iterator.zip = function () {
    return Iterator.unzip(Array.prototype.slice.call(arguments));
};

Iterator.range = function (start, stop, step) {
    if (arguments.length < 3) {
        step = 1;
    }
    if (arguments.length < 2) {
        stop = start;
        start = 0;
    }
    start = start || 0;
    step = step || 1;
    return new RangeIterator(start, stop, step);
};

Iterator.count = function (start, step) {
    return Iterator.range(start, Infinity, step);
};

function RangeIterator(start, stop, step) {
    this.start = start;
    this.stop = stop;
    this.step = step;
    this.index = 0;
}

RangeIterator.prototype = Object.create(Iterator.prototype);
RangeIterator.prototype.constructor = RangeIterator;

RangeIterator.prototype.next = function () {
    if (this.start >= this.stop) {
        return Iteration.done;
    } else {
        var result = this.start;
        this.start += this.step;
        return new Iteration(result, false, this.index++);
    }
};

Iterator.repeat = function (value, times) {
    if (times == null) {
        times = Infinity;
    }
    return new RepeatIterator(value, times);
};

function RepeatIterator(value, times) {
    this.value = value;
    this.times = times;
    this.index = 0;
}

RepeatIterator.prototype = Object.create(Iterator.prototype);
RepeatIterator.prototype.constructor = RepeatIterator;

RepeatIterator.prototype.next = function () {
    if (this.index < this.times) {
        return new Iteration(this.value, false, this.index++);
    } else {
        return Iteration.done;
    }
};

Iterator.enumerate = function (values, start) {
    return Iterator.count(start).iterateZip(new Iterator(values));
};

function EmptyIterator() {}

EmptyIterator.prototype = Object.create(Iterator.prototype);
EmptyIterator.prototype.constructor = EmptyIterator;

EmptyIterator.prototype.next = function () {
    return Iteration.done;
};

Iterator.empty = new EmptyIterator();


}],["observable.js","gtor","observable.js",{"asap":0,"weak-map":55,"collections/shim-array":6,"./observer":29,"./operators":30,"./iteration":26},function (require, exports, module, __filename, __dirname){

// gtor/observable.js
// ------------------


// An observable is a **lossy** **push** representation of a value that varies
// at **discrete** and observable moments in time.

"use strict";

var asap = require("asap");
var WeakMap = require("weak-map");
require("collections/shim-array");
var Observer = require("./observer");
var Operators = require("./operators");
var Iteration = require("./iteration");

// ## Observable

// Like promises, observables use the [revealing constructor pattern][Revealing
// Constructor].
//
// [Revealing Constructor]: http://domenic.me/2014/02/13/the-revealing-constructor-pattern/
//
// An observable has a corresponding emitter with a `yield` method.
// The constructor reveals the `yield` method as an argument to the setup function.

module.exports = Observable;
function Observable(setup) {
    var signal = Observable.signal();
    setup(signal.in.yield);
    return signal.out;
}

// The `signal` constructor method is analogous to the `Promise.defer()` method
// and returns an `{in, out}` pair consisting of a tangled emitter and
// observable.
Observable.signal = function (value, index) {
    var handler = new SignalHandler(value, index);
    var emitter = new Emitter();
    var observable = Object.create(Observable.prototype);
    handlers.set(emitter, handler);
    handlers.set(observable, handler);
    return {in: emitter, out: observable};
};

// The `yield` constructor method returns an observable that will forever yield
// the given value.
Observable.yield = function (value, index) {
    return new Observable(function (_yield) {
        _yield(value, index);
    });
};

// The `next` method provides the portion of the interface necessary to mimick
// an `Iterator`, and will always produce the last yielded iteration.
// Unlike a stream, the `next` method does not return a promise for an iteration.
Observable.prototype.next = function () {
    var handler = handlers.get(this);
    return new handler.Iteration(handler.value, false, handler.index);
};

// `forEach` registers an observer for the signal and returns the observer.
// An observer can be cancelled.
Observable.prototype.forEach = function (callback, thisp) {
    var handler = handlers.get(this);
    var observers = handler.observers;
    var observer = new Observer(callback, thisp, handler);
    handler.addObserver(observer);
    return observer;
};

// `map` produces a new signal that yields the return value of the given
// callback for each value in from this signal.
Observable.prototype.map = function (callback, thisp) {
    var signal = Observable.signal();
    this.forEach(function (value, index) {
        signal.in.yield(callback.call(thisp, value, index, this), index);
    }, this);
    return signal.out;
};

// `filter` produces a signal that yields the values from this signal if they
// pass a test.
Observable.prototype.filter = function (callback, thisp) {
    var signal = Observable.signal();
    this.forEach(function (value, index) {
        if (callback.call(thisp, value, index, this)) {
            signal.in.yield(value, index);
        }
    }, this);
    return signal.out;
};

// `reduce` produces a signal that yields the most recently accumulated value
// by combining each of this signals values with the aggregate of all previous.
// Note that unlike the array reducer, the basis is mandatory.
Observable.prototype.reduce = function (callback, basis, thisp) {
    var signal = Observable.signal();
    this.forEach(function (value, index) {
        basis = callback.call(thisp, basis, value, index, this);
        signal.in.yield(basis, index);
    }, this);
    return signal.out;
};

// The `thenYield` method ransforms this signal into a pulse.
// Each time this signal produces a value, the returned signal will yield the
// given value.
// The name is intended to parallel the `thenReturn` and `thenThrow` methods of
// tasks and promises.
Observable.prototype.thenYield = function (value) {
    return this.map(function () {
        return value;
    });
};

// The `count` method transforms this signal into a pulse counter.
// For each value that this signal produces, the returned signal will produce
// the count of values seen so far.
Observable.prototype.count = function (count, increment) {
    var signal = Observable.signal();
    count = count || 0;
    this.forEach(function (_, index) {
        count = (increment ? increment(count) : count + 1);
        signal.in.yield(count, index);
    });
    return signal.out;
};

// The `lift` constructor method lifts an operator from value space into signal
// space, such that instead of accepting and returning values, it instead
// accepts and returns signals.
/* TODO alter this method so that it can accept a mix of behaviors and signals */
Observable.lift = function (operator, thisp) {
    return function signalOperator() {
        var operandSignals = Array.prototype.slice.call(arguments);
        var operands = new Array(operandSignals.length);
        var defined = new Array(operandSignals.length);
        var pending = operandSignals.length;
        var signal = Observable.signal();
        operandSignals.forEach(function (operandSignal, index) {
            operandSignal.forEach(function (operand, time) {
                if (operand == null || operand !== operand) {
                    if (defined[index]) {
                        defined[index] = false;
                        pending++;
                    }
                    operands[index] = operand;
                } else {
                    operands[index] = operand;
                    if (!defined[index]) {
                        defined[index] = true;
                        pending--;
                    }
                    if (!pending) {
                        signal.in.yield(operator.apply(thisp, operands), time);
                    }
                }
            });
        });
        return signal.out;
    };
}

// For each operato in the `Operators` module, we produce both a constructor
// and a prototype method with the corresponding operator or method in signal space.
for (var name in Operators) {
    (function (operator, name) {
        Observable[name] = Observable.lift(operator, Operators);
        Observable.prototype[name] = function (that) {
            return Observable[name](this, that);
        };
    })(Operators[name], name);
}

// ## SignalHandler
//
// The observable and generator sides of a signal share private state on a
// signal handler hidden record.
// We use a weak map to track the corresponding handler for each generator and
// observable.

var handlers = new WeakMap();

function SignalHandler(value, index) {
    this.observers = [];
    this.value = value;
    this.index = index;
    this.active = false;
}

SignalHandler.prototype.Iteration = Iteration;

// The generator side uses the `yield` method to set the current value of the
// signal for a given time index and to arrange for an update to all observers.
// Note that we track observers in reverse order to take advantage of a small
// optimization afforded by countdown loops.
SignalHandler.prototype.yield = function (value, index) {
    this.value = value;
    this.index = index;
    if (!this.active) {
        return;
    }
    var observers = this.observers;
    var length = observers.length;
    var observerIndex = observers.length;
    while (observerIndex--) {
        observers[observerIndex].yield(value, index);
    }
};

/* TODO yieldEach to mirror yield* syntax of generators, possibly using handler
 * trickery. */

// The observable side of the signal uses `addObserver` and `cancelObserver`.

// The `addObserver` method will implicitly dispatch an initial value if the signal
// has been initialized and has already captured a meaningful value.
SignalHandler.prototype.addObserver = function (observer) {
    this.observers.unshift(observer);
    if (this.active && Operators.defined(this.value)) {
        observer.yield(this.value, this.index);
    }
    // If this is the first observer, we may need to activate the signal.
    asap(this);
};

SignalHandler.prototype.cancelObserver = function (observer) {
    var index = this.observers.indexOf(observer);
    if (index < 0) {
        return;
    }
    this.observers.swap(index, 1);
    // If this was the last remaining observer, we may need to deactivate the
    // signal.
    asap(this);
};

// The add and cancel observer methods both use asap to arrange for a possible
// signal state change, between active and inactive, in a separate event.
// Derrived signal handlers, for example the `ClockHandler`, may implement
// `onstart` and `onstop` event handlers.
SignalHandler.prototype.call = function () {
    if (!this.active) {
        if (this.observers.length) {
            if (this.onstart) {
                this.onstart();
            }
            this.active = true;
            if (Operators.defined(this.value)) {
                this.yield(this.value, this.index);
            }
        }
    } else {
        if (!this.observers.length) {
            if (this.onstop) {
                this.onstop();
            }
            this.active = false;
        }
    }
};

// ## Emitter
//
// A producer should receive a reference to the generator side of a signal.
// It hosts the methods needed to change the value captured by a signal and
// propagate change notifications.

function Emitter() {
    this.yield = this.yield.bind(this);
}

// The `yield` method updates the value for a given time index and radiates a
// change notification to any registered observers.
Emitter.prototype.yield = function (value, index) {
    var handler = handlers.get(this);
    handler.yield(value, index);
};

// The `inc` method assumes that the signal captures an integer and increments
// that value by one.
Emitter.prototype.inc = function (index) {
    var handler = handlers.get(this);
    this.yield(handler.value + 1, index);
};

// The `dec` method assumes that the signal captures an integer and decrements
// that value by one.
Emitter.prototype.dec = function (index) {
    var handler = handlers.get(this);
    this.yield(handler.value - 1, index);
};


}],["observer.js","gtor","observer.js",{"asap":0},function (require, exports, module, __filename, __dirname){

// gtor/observer.js
// ----------------

"use strict";

var asap = require("asap");

module.exports = Observer;
function Observer(callback, thisp, signal) {
    this.callback = callback;
    this.thisp = thisp;
    this.signal = signal;
    this.value = null;
    this.index = null;
    this.pending = false;
}

Observer.prototype.yield = function (value, index) {
    this.value = value;
    this.index = index;
    this.done = false;
    if (!this.pending) {
        this.pending = true;
        asap(this);
    }
};

Observer.prototype.call = function () {
    if (this.pending && !this.cancelled) {
        this.pending = false;
        this.callback.call(this.thisp, this.value, this.index, this.signal);
    }
};

Observer.prototype.cancel = function () {
    this.signal.cancelObserver(this);
    this.cancelled = true;
};


}],["operators.js","gtor","operators.js",{"collections/shim-object":8},function (require, exports, module, __filename, __dirname){

// gtor/operators.js
// -----------------

// The operators module provides named function objects corresponding to
// language operators.

"use strict";

// The equals and compare operators provided by the Collections package allow
// deep comparison of arbitrary values and delegate to the eponymous methods of
// instances if they are defined.

require("collections/shim-object");

exports.equals = Object.equals;

exports.compare = Object.compare;

exports.not = function (x) { return !x };

exports.and = function (x, y) { return x && y };

exports.or = function (x, y) { return x || y };

exports.add = function (x, y) {
    return x + y;
};

exports.sub = function (x, y) {
    return x - y;
};

exports.div = function (x, y) {
    return x / y;
};

exports.mul = function (x, y) {
    return x * y;
};

exports.tuple = function () {
    return Array.prototype.slice.call(arguments);
};

// Behaviors and signals will propagate undefined if any operand is not
// defined.

exports.defined = function (value) {
    // !NaN && !null && !undefined
    return value === value && value != null;
};


}],["promise-queue.js","gtor","promise-queue.js",{"./promise":32},function (require, exports, module, __filename, __dirname){

// gtor/promise-queue.js
// ---------------------


// A promise queue is an asynchronous linked list, representing a sequence of
// values over time.
// Consuming and producing that sequence are temporaly independent.
// For each respective promise and resolution, the promise may be gotten first
// and put later, or put first and gotten later.

// This implementation comes from Mark Miller's [Concurrency Strawman][] for
// ECMAScript.
//
// [Concurrency Strawman]: http://wiki.ecmascript.org/doku.php?id=strawman:concurrency

"use strict";

var Promise = require("./promise");

// ## PromiseQueue

// The promise queue constructor returns an entangled `get` and `put` pair.
// These methods may be passed as functions, granting either the capability to
// give or take but not necessarily both.

// Internally, a promise queue is an asynchronous linked list of deferreds.
// The `ends` variable is a `promise` and `resolver` pair.
// The `promise` is a promise for the next `ends` pair after this promise is
// taken.
// The `resolver` advances the `ends` pair after a resolution is given.
// The `promise` and `resolver` are independent properties, not necessarily
// corresponding to the same deferred.

module.exports = PromiseQueue;
function PromiseQueue(values) {
    if (!(this instanceof PromiseQueue)) {
        return new PromiseQueue();
    }
    var self = this;

    var ends = Promise.defer();

    // The `resolver` side of a promise queue adds a `{head, tail}` node to the
    // asynchronous linked list.
    // The `put` method creates a new link to the resolver side with the given
    // `head` value, and advances the `resolver` side of the list.
    this.put = function (value) {
        var next = Promise.defer();
        ends.resolver.return({
            head: value,
            tail: next.promise
        });
        ends.resolver = next.resolver;
    };

    // The `promise` end of a promise queue is a promise for a `{head, tail}`
    // pair.
    // The `head` will be the next value, and the `tail` will be a promise for
    // the remaining nodes of the list.
    // The `get` method obtains and returns a promise for the `head` value and
    // advances the `promise` to become the `tail`.
    this.get = function () {
        var result = ends.promise.get("head");
        ends.promise = ends.promise.get("tail");
        return result;
    };

    // The promise queue constructor allows the queue to be initialized with
    // a given population of values.
    if (values) {
        values.forEach(this.put, this);
    }
}


}],["promise.js","gtor","promise.js",{"collections/weak-map":9,"collections/iterator":5,"asap":0},function (require, exports, module, __filename, __dirname){

// gtor/promise.js
// ---------------


// A promise is a proxy for a result, be it a return value or a thrown error,
// regardless of whether that result happened in the past or the future, or
// even off in some other memory space.

/*!
 * Copyright 2009-2014 Kris Kowal under the terms of the MIT
 * license found at http://github.com/kriskowal/q/raw/master/LICENSE
 * With thanks to Mark Miller, creator of E promises and numerous documents and
 * examples regarding promises in JavaScript.
 * With thanks to Tyler Close, creator of the Waterken Q library, after which
 * these promises were originally modeled.
 * With thanks to Domenic Denicola for adopting my fork of Q and making its
 * cause his own.
 */

/* vim:ts=4:sts=4:sw=4: */
/*global -WeakMap */
"use strict";

var WeakMap = require("collections/weak-map");
var Iterator = require("collections/iterator");
// For executing tasks in seaparate events as soon as possible, without waiting
// yielding for IO or rendering.
var asap = require("asap");

// As a promise makes progress toward creating a result, it may need to defer
// to other promises multiple times before reaching a conclusion.
// For example, a promise to authenticate a user might first wait for the user
// to enter their name and then wait for the user to enter their password.
// In the way a relay runner passes a baton, promises have a handler that they
// can forward to another promise.
// This happens when a promise is resolved with another promise, or more often,
// when a promise handler function returns another promise.
// A deferred promise starts with a `PendingHandler`, which may pass along to
// any number of pending handlers before reaching a `FulfilledHandler` or
// `RejectedHandler`.
// There is also a `ThenableHandler` that keeps track of a foreign promise and
// makes sure we only call its `then` method once to convert it to one of our
// own.
// Another kind of handler can handle promises for remote objects and is
// responsible for forwarding messages across some message channel.

// Which handler is responsible for a particular promise is tracked by this
// weak map, making it rather difficult to confuse the internals of this module
// with a fake promise object and rather effectively hides the handler from
// anyone using the library.
var handlers = new WeakMap();

// When a deferred promise is forwarded to another promise, the old handler
// becomes the new handler and all messages past and present flow to the next
// handler.
// This algorithm shortens the chain each time someone accesses the handler for
// either a promise or a resolver, ensuring that future lookups are faster.
function Promise_getHandler(promise) {
    var handler = handlers.get(promise);
    while (handler && handler.became) {
        handler = handler.became;
    }
    handlers.set(promise, handler);
    return handler;
}

// The vicious cycle is a singleton promise that we use to break cyclic
// resolution chains.
// If you ever resolve a deferred promise ultimately with itself, you will get
// this promise instead.
var theViciousCycleError = new Error("Can't resolve a promise with itself");
var theViciousCycleRejection = Promise_throw(theViciousCycleError);
var theViciousCycle = Promise_getHandler(theViciousCycleRejection);

// We use this week map to ensure that we convert a thenable promise to a
// proper promise, calling its then method, once.
// A proper promise does not produce side effects when you call `then`, but
// thenables do not make that guarantee.
// A thenable might for example only start working when you call `then`, every
// time you call `then`.
var thenables = new WeakMap();

// And now the star of the show...

// ## Promise constructor

/**
 * Creates a promise.
 * @param handler may be a function or a promise handler object.
 * If it is a function, the function is called before this constructor returns,
 * with the arguments `resolve`, `reject`, and `setEstimate`, the former also
 * known as `return` and `throw`.
 * An exception thrown in the setup function will be forwarded to the promise.
 * A return value will be ignored.
 * The setup function is responsible for arranging one of the given functions
 * to be called with an eventual result.
 */
module.exports = Promise;
function Promise(handler) {
    if (!(this instanceof Promise)) {
        return new Promise(handler);
    }
    if (typeof handler === "function") {
        // "Instead of handler, got setup function.
        // Would not buy again."
        var setup = handler;
        var deferred = Promise_defer();
        handler = Promise_getHandler(deferred.promise);
        try {
            setup(deferred.resolve, deferred.reject, deferred.setEstimate);
        } catch (error) {
            deferred.resolver.throw(error);
        }
    }
    handlers.set(this, handler);
}

// ### Methods

/**
 * Constructs a {promise, resolve, reject} object.
 *
 * `resolve` is a callback to invoke with a more resolved value for the
 * promise. To fulfill the promise, invoke `resolve` with any value that is
 * not a thenable. To reject the promise, invoke `resolve` with a rejected
 * thenable, or invoke `reject` with the reason directly. To resolve the
 * promise to another thenable, thus putting it in the same state, invoke
 * `resolve` with that other thenable.
 *
 * @returns {{promise, resolve, reject}} a deferred
 */
Promise.defer = Promise_defer;
function Promise_defer() {

    var handler = new Pending();
    var promise = new Promise(handler);
    var deferred = new Deferred(promise);

    return deferred;
}

/**
 * Coerces a value to a promise. If the value is a promise, pass it through
 * unaltered. If the value has a `then` method, it is presumed to be a promise
 * but not one of our own, so it is treated as a “thenable” promise and this
 * returns a promise that stands for it. Otherwise, this returns a promise that
 * has already been fulfilled with the value.
 * @param value promise, object with a then method, or a fulfillment value
 * @returns {Promise} the same promise as given, or a promise for the given
 * value
 */
Promise.return = Promise_return;
function Promise_return(value) {
    // If the object is already a Promise, return it directly.  This enables
    // the resolve function to both be used to created references from objects,
    // but to tolerably coerce non-promises to promises.
    if (isPromise(value)) {
        return value;
    } else if (isThenable(value)) {
        if (!thenables.has(value)) {
            thenables.set(value, new Promise(new Thenable(value)));
        }
        return thenables.get(value);
    } else {
        return new Promise(new Fulfilled(value));
    }
}

/**
 * Returns a promise that has been rejected with a reason, which should be an
 * instance of `Error`.
 * @param {Error} error reason for the failure.
 * @returns {Promise} rejection
 */
Promise.throw = Promise_throw;
function Promise_throw(error) {
    return new Promise(new Rejected(error));
}

/**
 * @returns {boolean} whether the given value is a promise.
 */
Promise.isPromise = isPromise;
function isPromise(object) {
    return Object(object) === object && !!handlers.get(object);
}

/**
 * @returns {boolean} whether the given value is an object with a then method.
 * @private
 */
function isThenable(object) {
    return Object(object) === object && typeof object.then === "function";
}

/**
 * Coerces a value to a promise if it is not one already and then waits for it
 * to be fulfilled or rejected, returning a promise for the result of either
 * the fulfillment or rejection handler.
 */
Promise.when = function Promise_when(value, onreturn, onthrow, ms) {
    return Promise.return(value).then(onreturn, onthrow, ms);
};

/**
 * Turns an array of promises into a promise for an array.  If any of the
 * promises gets rejected, the whole array is rejected immediately.
 * @param {Array.<Promise>} an array (or promise for an array) of values (or
 * promises for values)
 * @returns {Promise.<Array>} a promise for an array of the corresponding values
 */
/* By Mark Miller
 * http://wiki.ecmascript.org/doku.php?id=strawman:concurrency&rev=1308776521#allfulfilled
 */
Promise.all = Promise_all;
function Promise_all(questions) {
    var countDown = 0;
    var deferred = Promise_defer();
    var answers = Array(questions.length);
    var estimates = [];
    var estimate = -Infinity;
    var setEstimate;
    Array.prototype.forEach.call(questions, function Promise_all_each(promise, index) {
        var handler;
        if (
            isPromise(promise) &&
            (handler = Promise_getHandler(promise)).state === "fulfilled"
        ) {
            answers[index] = handler.value;
        } else {
            ++countDown;
            promise = Promise_return(promise);
            promise.done(
                function Promise_all_eachFulfilled(value) {
                    answers[index] = value;
                    if (--countDown === 0) {
                        deferred.resolver.return(answers);
                    }
                },
                deferred.reject
            );

            promise.observeEstimate(function Promise_all_eachEstimate(newEstimate) {
                var oldEstimate = estimates[index];
                estimates[index] = newEstimate;
                if (newEstimate > estimate) {
                    estimate = newEstimate;
                } else if (oldEstimate === estimate && newEstimate <= estimate) {
                    // There is a 1/length chance that we will need to perform
                    // this O(length) walk, so amortized O(1)
                    computeEstimate();
                }
                if (estimates.length === questions.length && estimate !== setEstimate) {
                    deferred.setEstimate(estimate);
                    setEstimate = estimate;
                }
            });

        }
    });

    function computeEstimate() {
        estimate = -Infinity;
        for (var index = 0; index < estimates.length; index++) {
            if (estimates[index] > estimate) {
                estimate = estimates[index];
            }
        }
    }

    if (countDown === 0) {
        deferred.resolver.return(answers);
    }

    return deferred.promise;
}

/**
 * @see Promise#allSettled
 */
Promise.allSettled = Promise_allSettled;
function Promise_allSettled(questions) {
    return Promise_all(questions.map(function Promise_allSettled_each(promise) {
        promise = Promise_return(promise);
        function regardless() {
            return promise.inspect();
        }
        return promise.then(regardless, regardless);
    }));
}

/**
 * Returns a promise for the given value (or promised value), some
 * milliseconds after it resolved. Passes rejections immediately.
 * @param {Any*} promise
 * @param {Number} milliseconds
 * @returns a promise for the resolution of the given promise after milliseconds
 * time has elapsed since the resolution of the given promise.
 * If the given promise rejects, that is passed immediately.
 */
Promise.delay = function Promise_delay(object, timeout) {
    if (timeout === void 0) {
        timeout = object;
        object = void 0;
    }
    return Promise_return(object).delay(timeout);
};

/**
 * Causes a promise to be rejected if it does not get fulfilled before
 * some milliseconds time out.
 * @param {Any*} promise
 * @param {Number} milliseconds timeout
 * @param {String} custom error message (optional)
 * @returns a promise for the resolution of the given promise if it is
 * fulfilled before the timeout, otherwise rejected.
 */
Promise.timeout = function Promise_timeout(object, ms, message) {
    return Promise_return(object).timeout(ms, message);
};

/**
 * Spreads the values of a promised array of arguments into the
 * fulfillment callback.
 * @param onreturn callback that receives variadic arguments from the
 * promised array
 * @param onthrow callback that receives the exception if the promise
 * is rejected.
 * @returns a promise for the return value or thrown exception of
 * either callback.
 */
Promise.spread = Promise_spread;
function Promise_spread(value, onreturn, onthrow) {
    return Promise_return(value).spread(onreturn, onthrow);
}

/**
 * If two promises eventually fulfill to the same value, promises that value,
 * but otherwise rejects.
 * @param x {Any*}
 * @param y {Any*}
 * @returns {Any*} a promise for x and y if they are the same, but a rejection
 * otherwise.
 *
 */
Promise.join = function Promise_join(x, y) {
    return Promise_spread([x, y], function Promise_joined(x, y) {
        if (x === y) {
            // TODO: "===" should be Object.is or equiv
            return x;
        } else {
            throw new Error("Can't join: not the same: " + x + " " + y);
        }
    });
};

/**
 * Returns a promise for the first of an array of promises to become fulfilled.
 * @param answers {Array} promises to race
 * @returns {Promise} the first promise to be fulfilled
 */
Promise.race = Promise_race;
function Promise_race(answerPs) {
    return new Promise(function(deferred) {
        answerPs.forEach(function(answerP) {
            Promise_return(answerP).then(deferred.resolve, deferred.reject);
        });
    });
}

/**
 * Calls the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param thisp     call context, in the JavaScript sense, which may not be
 *                  applicable to promises for remote non-JavaScript objects.
 * @param ...args   array of application arguments
 */
Promise.try = function Promise_try(callback, thisp) {
    var args = [];
    for (var index = 2; index < arguments.length; index++) {
        args[index - 2] = arguments[index];
    }
    return Promise_return(callback).dispatch("call", [args, thisp]);
};

/**
 * TODO
 */
Promise.function = Promise_function;
function Promise_function(wrapped) {
    return function promiseFunctionWrapper() {
        var args = new Array(arguments.length);
        for (var index = 0; index < arguments.length; index++) {
            args[index] = arguments[index];
        }
        return Promise_return(wrapped).apply(this, args);
    };
}

/**
 * The promised function decorator ensures that any promise arguments
 * are settled and passed as values (`this` is also settled and passed
 * as a value).  It will also ensure that the result of a function is
 * always a promise.
 *
 * @example
 * var add = Promise.promised(function (a, b) {
 *     return a + b;
 * });
 * add(Promise.return(a), Promise.return(B));
 *
 * @param {function} callback The function to decorate
 * @returns {function} a function that has been decorated.
 */
Promise.promised = function Promise_promised(callback) {
    return function promisedMethod() {
        var args = new Array(arguments.length);
        for (var index = 0; index < arguments.length; index++) {
            args[index] = arguments[index];
        }
        return Promise_spread(
            [this, Promise_all(args)],
            function Promise_promised_spread(self, args) {
                return callback.apply(self, args);
            }
        );
    };
};

/**
 */
Promise.passByCopy = // TODO XXX experimental
Promise.push = function (value) {
    if (Object(value) === value && !isPromise(value)) {
        passByCopies.set(value, true);
    }
    return value;
};

Promise.isPortable = function (value) {
    return Object(value) === value && passByCopies.has(value);
};

var passByCopies = new WeakMap();

/**
 * The async function is a decorator for generator functions, turning
 * them into asynchronous generators. Although generators are only
 * part of the newest ECMAScript 6 drafts, this code does not cause
 * syntax errors in older engines. This code should continue to work
 * and will in fact improve over time as the language improves.
 *
 * ES6 generators are currently part of V8 version 3.19 with the
 * `--harmony-generators` runtime flag enabled. This function does not
 * support the former, Pythonic generators that were only implemented
 * by SpiderMonkey.
 *
 * Decorates a generator function such that:
 *  - it may yield promises
 *  - execution will continue when that promise is fulfilled
 *  - the value of the yield expression will be the fulfilled value
 *  - it returns a promise for the return value (when the generator
 *    stops iterating)
 *  - the decorated function returns a promise for the return value
 *    of the generator or the first rejected promise among those
 *    yielded.
 *  - if an error is thrown in the generator, it propagates through
 *    every following yield until it is caught, or until it escapes
 *    the generator function altogether, and is translated into a
 *    rejection for the promise returned by the decorated generator.
 */
Promise.async = Promise_async;
function Promise_async(makeGenerator) {
    return function spawn() {
        // when verb is "next", arg is a value
        // when verb is "throw", arg is an exception
        function continuer(verb, arg) {
            var iteration;
            try {
                iteration = generator[verb](arg);
            } catch (exception) {
                return Promise_throw(exception);
            }
            if (iteration.done) {
                return Promise_return(iteration.value);
            } else {
                return Promise_return(iteration.value).then(callback, errback);
            }
        }
        var generator = makeGenerator.apply(this, arguments);
        var callback = continuer.bind(continuer, "next");
        var errback = continuer.bind(continuer, "throw");
        return callback();
    };
}

/**
 * The spawn function is a small wrapper around async that immediately
 * calls the generator and also ends the promise chain, so that any
 * unhandled errors are thrown instead of forwarded to the error
 * handler. This is useful because it's extremely common to run
 * generators at the top-level to work with libraries.
 */
Promise.spawn = Promise_spawn;
function Promise_spawn(makeGenerator) {
    Promise_async(makeGenerator)().done();
}



// ## Promise prototype


// ### Regarding the state of the promise

/**
 * Synchronously produces a snapshot of the internal state of the promise.  The
 * object will have a `state` property. If the `state` is `"pending"`, there
 * will be no further information. If the `state` is `"fulfilled"`, there will
 * be a `value` property. If the state is `"rejected"` there will be a `reason`
 * property.  If the promise was constructed from a “thenable” and `then` nor
 * any other method has been dispatched on the promise has been called, the
 * state will be `"pending"`. The state object will not be updated if the
 * state changes and changing it will have no effect on the promise. Every
 * call to `inspect` produces a unique object.
 * @returns {{state: string, value?, reason?}}
 */
Promise.prototype.inspect = function Promise_inspect() {
    // the second layer captures only the relevant "state" properties of the
    // handler to prevent leaking the capability to access or alter the
    // handler.
    return Promise_getHandler(this).inspect();
};

/**
 * @returns {boolean} whether the promise is waiting for a result.
 */
Promise.prototype.isPending = function Promise_isPending() {
    return Promise_getHandler(this).state === "pending";
};

/**
 * @returns {boolean} whether the promise has ended in a result and has a
 * fulfillment value.
 */
Promise.prototype.isFulfilled = function Promise_isFulfilled() {
    return Promise_getHandler(this).state === "fulfilled";
};

/**
 * @returns {boolean} whether the promise has ended poorly and has a reason for
 * its rejection.
 */
Promise.prototype.isRejected = function Promise_isRejected() {
    return Promise_getHandler(this).state === "rejected";
};

/**
 * TODO
 */
Promise.prototype.toBePassed = function Promise_toBePassed() {
    return Promise_getHandler(this).state === "passed";
};

/**
 * @returns {string} merely `"[object Promise]"`
 */
Promise.prototype.toString = function Promise_toString() {
    return "[object Promise]";
};

// ### Composition

/**
 * Terminates a chain of promises, forcing rejections to be
 * thrown as exceptions.
 * @param onreturn
 * @param onthrow
 */
Promise.prototype.done = function Promise_done(onreturn, onthrow, thisp) {
    var self = this;
    var done = false;   // ensure the untrusted promise makes at most a
                        // single call to one of the callbacks
    asap(function Promise_done_task() {
        var _onreturn;
        if (typeof onreturn === "function") {
            if (Promise.onerror) {
                _onreturn = function Promise_done_onreturn(value) {
                    if (done) {
                        return;
                    }
                    done = true;
                    try {
                        onreturn.call(thisp, value);
                    } catch (error) {
                        // fallback to rethrow is still necessary because
                        // _onreturn is not called in the same event as the
                        // above guard.
                        (Promise.onerror || Promise_rethrow)(error);
                    }
                };
            } else {
                _onreturn = function Promise_done_onreturn(value) {
                    if (done) {
                        return;
                    }
                    done = true;
                    onreturn.call(thisp, value);
                };
            }
        }

        var _onthrow;
        if (typeof onthrow === "function" && Promise.onerror) {
            _onthrow = function Promise_done_onthrow(error) {
                if (done) {
                    return;
                }
                done = true;
                // makeStackTraceLong(error, self);
                try {
                    onthrow.call(thisp, error);
                } catch (newError) {
                    (Promise.onerror || Promise_rethrow)(newError);
                }
            };
        } else if (typeof onthrow === "function") {
            _onthrow = function Promise_done_onthrow(error) {
                if (done) {
                    return;
                }
                done = true;
                // makeStackTraceLong(error, self);
                onthrow.call(thisp, error);
            };
        } else {
            _onthrow = Promise.onerror || Promise_rethrow;
        }

        if (typeof process === "object" && process.domain) {
            _onthrow = process.domain.bind(_onthrow);
        }

        Promise_getHandler(self).dispatch(_onreturn, "then", [_onthrow]);
    });
};

/**
 * Creates a new promise, waits for this promise to be resolved, and informs
 * either the fullfilled or rejected handler of the result. Whatever result
 * comes of the onreturn or onthrow handler, a value returned, a promise
 * returned, or an error thrown, becomes the resolution for the promise
 * returned by `then`.
 *
 * @param onreturn
 * @param onthrow
 * @returns {Promise} for the result of `onreturn` or `onthrow`.
 */
Promise.prototype.then = function Promise_then(onreturn, onthrow) {
    var self = this;
    var deferred = Promise_defer();

    var ms, status, thisp, arg;
    for (var index = 0; index < arguments.length; index++) {
        arg = arguments[index];
        if (typeof arg === "number") { // ms estimated duration of fulfillment handler
            ms = arg;
        } else if (typeof arg === "string") { // status
            status = arg;
        } else if (typeof arg === "object") { // thisp
            thisp = arg;
        }
    }

    var _onreturn;
    if (typeof onreturn === "function") {
        _onreturn = function Promise_then_onreturn(value) {
            try {
                deferred.resolver.return(onreturn.call(thisp, value));
            } catch (error) {
                deferred.resolver.throw(error);
            }
        };
    } else {
        _onreturn = deferred.resolve;
    }

    var _onthrow;
    if (typeof onthrow === "function") {
        _onthrow = function Promise_then_onthrow(error) {
            try {
                deferred.resolver.return(onthrow.call(thisp, error));
            } catch (newError) {
                deferred.resolver.throw(newError);
            }
        };
    } else {
        _onthrow = deferred.reject;
    }

    this.done(_onreturn, _onthrow, thisp);

    if (ms !== void 0) {
        var updateEstimate = function Promise_then_updateEstimate() {
            deferred.setEstimate(self.getEstimate() + ms);
        };
        this.observeEstimate(updateEstimate);
        updateEstimate();
    }

    return deferred.promise;
};

function Promise_rethrow(error) {
    throw error;
}

/**
 * Waits for the fulfillment of this promise then resolves the returned promise
 * with the given value.
 */
Promise.prototype.thenReturn = function Promise_thenReturn(value) {
    // Wrapping ahead of time to forestall multiple wrappers.
    value = Promise_return(value);
    // Using all is necessary to aggregate the estimated time to completion.
    return Promise_all([this, value]).then(function Promise_thenReturn_resolved() {
        return value;
    }, null, 0);
    // 0: does not contribute significantly to the estimated time to
    // completion.
};

/**
 * Waits for the fulfillment of this promise and then rejects the returned
 * promise with the given error.
 */
Promise.prototype.thenThrow = function Promise_thenThrow(error) {
    return this.then(function Promise_thenThrow_resolved() {
        throw error;
    }, null, 0);
    // 0: does not contribute significantly to the estimated time to
    // completion.
};

/**
 * A shorthand for `then(null, onthrow)`, only catches exceptions and allows
 * values to pass through.
 */
Promise.prototype.catch = function Promise_catch(onthrow, thisp) {
    return this.then(void 0, onthrow, thisp);
};

/**
 * Ensures that the given handler will run regardless when this promise settles.
 * This promise's fulfillment value or rejection error should pass through
 * unaltered, but may be delayed if the finally handler returns a promise, and
 * may be replaced if the finally handler eventually throws an error.
 */
Promise.prototype.finally = function Promise_finally(callback) {
    if (!callback) {
        return this;
    }

    callback = Promise_return(callback);
    var ms, status, thisp, arg;
    for (var index = 0; index < arguments.length; index++) {
        arg = arguments[index];
        if (typeof arg === "number") { // ms estimated duration of fulfillment handler
            ms = arg;
        } else if (typeof arg === "string") { // status
            status = arg;
        } else if (typeof arg === "object") { // thisp
            thisp = arg;
        }
    }

    return this.then(function (value) {
        return callback.call(thisp).then(function Promise_finally_onreturn() {
            return value;
        });
    }, function (reason) {
        // TODO attempt to recycle the rejection with "this".
        return callback.call(thisp).then(function Promise_finally_onthrow() {
            throw reason;
        });
    }, status, ms);
};


// ### Segue to promises for arrays

/**
 * Similar to `then` but waits for the fulfillment of this promise to become an
 * array and then spreads those values into the arguments of a fulfillment
 * handler.
 */
Promise.prototype.spread = function Promise_spread(onreturn, onthrow, ms) {
    return this.then(function Promise_spread_onreturn(array) {
        return onreturn.apply(void 0, array);
    }, onthrow, ms);
};

/**
 * Transforms this promise for an array of promises and transforms it to a
 * promise for an array of the corresponding fulfillment values, but rejects
 * immediately if any of the given promises are onthrow.
 */
Promise.prototype.all = function Promise_all() {
    return this.then(Promise_all);
};

/**
 * Turns an array of promises into a promise for an array of their states (as
 * returned by `inspect`) when they have all settled.
 * @param {Array[Any*]} values an array (or promise for an array) of values (or
 * promises for values)
 * @returns {Array[State]} an array of states for the respective values.
 */
Promise.prototype.allSettled = function Promise_allSettled() {
    return this.then(Promise_allSettled);
};


// ### Regarding the estimated time to completion

/**
 * TODO
 */
Promise.prototype.observeEstimate = function Promise_observeEstimate(emit) {
    this.rawDispatch(null, "estimate", [emit]);
    return this;
};

/**
 * TODO
 */
Promise.prototype.getEstimate = function Promise_getEstimate() {
    return Promise_getHandler(this).estimate;
};

// ### Regarding the status

// TODO

// ### Sending messages to promises for objects

/**
 * Sends a message to a promise, receiving the resolution through an optional
 * callback.
 */
Promise.prototype.rawDispatch = function Promise_rawDispatch(resolve, op, args) {
    var self = this;
    asap(function Promise_dispatch_task() {
        Promise_getHandler(self).dispatch(resolve, op, args);
    });
};

/**
 * Sends a message to a promise, returning a promise for the result.
 */
Promise.prototype.dispatch = function Promise_dispatch(op, args) {
    var deferred = Promise_defer();
    this.rawDispatch(deferred.resolve, op, args);
    return deferred.promise;
};

/**
 * Returns a promise for a property of the eventual value of this promise.
 */
Promise.prototype.get = function Promise_get(name) {
    return this.dispatch("get", [name]);
};

/**
 * Returns a promise for the result of a method invocation on the eventual
 * value of this promise.
 */
Promise.prototype.invoke = function Promise_invoke(name /*...args*/) {
    var args = new Array(arguments.length - 1);
    for (var index = 1; index < arguments.length; index++) {
        args[index - 1] = arguments[index];
    }
    return this.dispatch("invoke", [name, args]);
};

/**
 * Returns a promise for the result of applying the eventual function that this
 * promise resolves to.
 */
Promise.prototype.apply = function Promise_apply(thisp, args) {
    return this.dispatch("call", [args, thisp]);
};

/**
 * Returns a promise for the result of applying the eventual function that this
 * promise resolves to, with the rest of the arguments.
 */
Promise.prototype.call = function Promise_call(thisp /*, ...args*/) {
    var args = new Array(Math.max(0, arguments.length - 1));
    for (var index = 1; index < arguments.length; index++) {
        args[index - 1] = arguments[index];
    }
    return this.dispatch("call", [args, thisp]);
};

/**
 * Returns a function that will return a promise for the eventual application
 * of the promised function with the rest of these arguments and the given
 * arguments combined.
 */
Promise.prototype.bind = function Promise_bind(thisp /*, ...args*/) {
    var self = this;
    var args = new Array(Math.max(0, arguments.length - 1));
    for (var index = 1; index < arguments.length; index++) {
        args[index - 1] = arguments[index];
    }
    return function Promise_bind_bound(/*...args*/) {
        var boundArgs = args.slice();
        for (var index = 0; index < arguments.length; index++) {
            boundArgs[boundArgs.length] = arguments[index];
        }
        return self.dispatch("call", [boundArgs, thisp]);
    };
};

/**
 * Returns a promise for the keys of the eventual object for this promise.
 */
Promise.prototype.keys = function Promise_keys() {
    return this.dispatch("keys", []);
};

/**
 * Returns a promise for an iterator of the eventual object for this promise.
 */
Promise.prototype.iterate = function Promise_iterate() {
    return this.dispatch("iterate", []);
};


// ### Promises and time

/**
 * Causes a promise to be onthrow if it does not get fulfilled before
 * some milliseconds time out.
 * @param {Number} milliseconds timeout
 * @param {String} custom error message (optional)
 * @returns a promise for the resolution of the given promise if it is
 * fulfilled before the timeout, otherwise onthrow.
 */
Promise.prototype.timeout = function Promsie_timeout(ms, message) {
    var deferred = Promise_defer();
    var timeoutId = setTimeout(function Promise_timeout_task() {
        deferred.resolver.throw(new Error(message || "Timed out after " + ms + " ms"));
    }, ms);

    this.done(function Promise_timeout_onreturn(value) {
        clearTimeout(timeoutId);
        deferred.resolver.return(value);
    }, function Promise_timeout_onthrow(error) {
        clearTimeout(timeoutId);
        deferred.resolver.throw(error);
    });

    return deferred.promise;
};

/**
 * Returns a promise for the given value (or promised value), some
 * milliseconds after it resolved. Passes rejections immediately.
 * @param {Any*} promise
 * @param {Number} milliseconds
 * @returns a promise for the resolution of the given promise after milliseconds
 * time has elapsed since the resolution of the given promise.
 * If the given promise rejects, that is passed immediately.
 */
Promise.prototype.delay = function Promise_delay(ms) {
    return this.then(function Promise_delay_onreturn(value) {
        var deferred = Promise_defer();
        deferred.setEstimate(Date.now() + ms);
        var timeoutId = setTimeout(function () {
            deferred.resolve(value);
        }, ms);
        return deferred.promise;
    }, null, ms);
};


// ### Promises for remote values and objects

/**
 * Returns a promise for a copy of the remote object or array proxied by this
 * promise.
 */
Promise.prototype.pull = function Promise_pull() {
    return this.dispatch("pull", []);
};

/**
 * Returns a promise for the same value, except noting that it should be passed
 * by copy instead of by reference if it is transported to a remote promise.
 */
Promise.prototype.pass = function Promise_pass() {
    if (!this.toBePassed()) {
        return new Promise(new Passed(this));
    } else {
        return this;
    }
};


// ## Deferred

// Thus begins the portion of the interface dedicated to pending promises.

// A deferred retains a private reference to the promise it corresponds to so
// that if its promise property is overwritten, as it is when using deferreds
// in PromiseQueue, the resolver will still communicate with its intrinsic
// promise dual.
var promises = new WeakMap();

exports.Deferred = Deferred;
function Deferred(promise) {
    this.promise = promise;
    promises.set(this, promise);
    var self = this;

    var resolve = this.return;

    // Bind the resolver

    // Also support a new interface that hosts the resolver methods together,
    // as the singular analog of an asynchronous generator, or the asynchronous
    // analog of a singular setter.
    this.resolver = {};

    this.resolver.return =
    this.return =
    this.resolve = function (value) {
        resolve.call(self, value);
    };

    var reject = this.throw;
    this.resolver.throw =
    this.throw =
    this.reject = function (error) {
        reject.call(self, error);
    };

    this.in = this.resolver;
    this.out = this.promise;
}

/**
 * Sets the resolution of the corresponding promise to the given fulfillment
 * value or promise, causing the pending messages to be forwarded.
 */
Deferred.prototype.return = function Deferred_return(value) {
    var handler = Promise_getHandler(promises.get(this));
    if (!handler.messages) {
        return;
    }
    handler.become(Promise.return(value));
};

/**
 * Sets the resolution of the corresponding promise to an asynchronously thrown
 * error.
 */
Deferred.prototype.throw = function Deferred_throw(reason) {
    var handler = Promise_getHandler(promises.get(this));
    if (!handler.messages) {
        return;
    }
    handler.become(Promise_throw(reason));
};


// ### Regarding the estimated time to completion

/**
 * Sets and emits the estimated time to completion for this promise, eventually
 * notifying all observers.
 */
Deferred.prototype.setEstimate = function Deferred_setEstimate(estimate) {
    estimate = +estimate;
    if (estimate !== estimate) {
        estimate = Infinity;
    }
    if (estimate < 1e12 && estimate !== -Infinity) {
        throw new Error("Estimate values should be a number of miliseconds in the future");
    }
    var handler = Promise_getHandler(promises.get(this));
    // TODO There is a bit of capability leakage going on here. The Deferred
    // should only be able to set the estimate for its original
    // Pending, not for any handler that promise subsequently became.
    if (handler.setEstimate) {
        handler.setEstimate(estimate);
    }
};

// Thus ends the public interface.

// And, thus begins the portion dedicated to handlers.

// Handlers represent the state of a promise and determine how the promise
// handles messages and state inquiries.

function Fulfilled(value) {
    this.value = value;
    this.estimate = Date.now();
}

Fulfilled.prototype.state = "fulfilled";

Fulfilled.prototype.inspect = function Fulfilled_inspect() {
    return {state: "fulfilled", value: this.value};
};

Fulfilled.prototype.dispatch = function Fulfilled_dispatch(
    resolve, op, operands
) {
    var result;
    if (
        op === "then" ||
        op === "get" ||
        op === "call" ||
        op === "invoke" ||
        op === "keys" ||
        op === "iterate" ||
        op === "pull"
    ) {
        try {
            result = this[op].apply(this, operands);
        } catch (exception) {
            result = Promise_throw(exception);
        }
    } else if (op === "estimate") {
        operands[0].call(void 0, this.estimate);
    } else {
        var error = new Error(
            "Fulfilled promises do not support the " + op + " operator"
        );
        result = Promise_throw(error);
    }
    if (resolve) {
        resolve(result);
    }
};

Fulfilled.prototype.then = function Fulfilled_then() {
    return this.value;
};

Fulfilled.prototype.get = function Fulfilled_get(name) {
    return this.value[name];
};

Fulfilled.prototype.call = function Fulfilled_call(args, thisp) {
    return this.callInvoke(this.value, args, thisp);
};

Fulfilled.prototype.invoke = function Fulfilled_invoke(name, args) {
    return this.callInvoke(this.value[name], args, this.value);
};

Fulfilled.prototype.callInvoke = function Fulfilled_callInvoke(callback, args, thisp) {
    var waitToBePassed;
    for (var index = 0; index < args.length; index++) {
        if (isPromise(args[index]) && args[index].toBePassed()) {
            waitToBePassed = waitToBePassed || [];
            waitToBePassed.push(args[index]);
        }
    }
    if (waitToBePassed) {
        var self = this;
        return Promise_all(waitToBePassed).then(function () {
            return self.callInvoke(callback, args.map(function (arg) {
                if (isPromise(arg) && arg.toBePassed()) {
                    return arg.inspect().value;
                } else {
                    return arg;
                }
            }), thisp);
        });
    } else {
        return callback.apply(thisp, args);
    }
};

Fulfilled.prototype.keys = function Fulfilled_keys() {
    return Object.keys(this.value);
};

Fulfilled.prototype.iterate = function Fulfilled_iterate() {
    return new Iterator(this.value);
};

Fulfilled.prototype.pull = function Fulfilled_pull() {
    var result;
    if (Object(this.value) === this.value) {
        result = Array.isArray(this.value) ? [] : {};
        for (var name in this.value) {
            result[name] = this.value[name];
        }
    } else {
        result = this.value;
    }
    return Promise.push(result);
};


function Rejected(reason) {
    this.reason = reason;
    this.estimate = Infinity;
}

Rejected.prototype.state = "rejected";

Rejected.prototype.inspect = function Rejected_inspect() {
    return {state: "rejected", reason: this.reason};
};

Rejected.prototype.dispatch = function Rejected_dispatch(
    resolve, op, operands
) {
    var result;
    if (op === "then") {
        result = this.then(resolve, operands[0]);
    } else {
        result = this;
    }
    if (resolve) {
        resolve(result);
    }
};

Rejected.prototype.then = function Rejected_then(
    onreturn, onthrow
) {
    return onthrow ? onthrow(this.reason) : this;
};


function Pending() {
    // if "messages" is an "Array", that indicates that the promise has not yet
    // been resolved.  If it is "undefined", it has been resolved.  Each
    // element of the messages array is itself an array of complete arguments to
    // forward to the resolved promise.  We coerce the resolution value to a
    // promise using the `resolve` function because it handles both fully
    // non-thenable values and other thenables gracefully.
    this.messages = [];
    this.observers = [];
    this.estimate = Infinity;
}

Pending.prototype.state = "pending";

Pending.prototype.inspect = function Pending_inspect() {
    return {state: "pending"};
};

Pending.prototype.dispatch = function Pending_dispatch(resolve, op, operands) {
    this.messages.push([resolve, op, operands]);
    if (op === "estimate") {
        this.observers.push(operands[0]);
        var self = this;
        asap(function Pending_dispatch_task() {
            operands[0].call(void 0, self.estimate);
        });
    }
};

Pending.prototype.become = function Pending_become(promise) {
    this.became = theViciousCycle;
    var handler = Promise_getHandler(promise);
    this.became = handler;

    handlers.set(promise, handler);
    this.promise = void 0;

    this.messages.forEach(function Pending_become_eachMessage(message) {
        // makeQ does not have this asap call, so it must be queueing events
        // downstream. TODO look at makeQ to ascertain
        asap(function Pending_become_eachMessage_task() {
            var handler = Promise_getHandler(promise);
            handler.dispatch.apply(handler, message);
        });
    });

    this.messages = void 0;
    this.observers = void 0;
};

Pending.prototype.setEstimate = function Pending_setEstimate(estimate) {
    if (this.observers) {
        var self = this;
        self.estimate = estimate;
        this.observers.forEach(function Pending_eachObserver(observer) {
            asap(function Pending_setEstimate_eachObserver_task() {
                observer.call(void 0, estimate);
            });
        });
    }
};

function Thenable(thenable) {
    this.thenable = thenable;
    this.became = null;
    this.estimate = Infinity;
}

Thenable.prototype.state = "thenable";

Thenable.prototype.inspect = function Thenable_inspect() {
    return {state: "pending"};
};

Thenable.prototype.cast = function Thenable_cast() {
    if (!this.became) {
        var deferred = Promise_defer();
        var thenable = this.thenable;
        asap(function Thenable_cast_task() {
            try {
                thenable.then(deferred.resolve, deferred.reject);
            } catch (exception) {
                deferred.resolver.throw(exception);
            }
        });
        this.became = Promise_getHandler(deferred.promise);
    }
    return this.became;
};

Thenable.prototype.dispatch = function Thenable_dispatch(resolve, op, args) {
    this.cast().dispatch(resolve, op, args);
};

// A passed promise is a thin proxy for another promise and differs only in
// that its state is "passed".
// This allows a message passing transport to identify this promise as one that
// should eventually pass its value by copy to the other end of any connection.

function Passed(promise) {
    this.promise = promise;
}

Passed.prototype.state = "passed";

Passed.prototype.inspect = function Passed_inspect() {
    return this.promise.inspect();
};

Passed.prototype.dispatch = function Passed_dispatch(resolve, op, args) {
    return this.promise.rawDispatch(resolve, op, args);
};


// ## Node.js

// Thus begins the Promise Node.js bridge

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback, forwarding the given variadic arguments, plus a provided
 * callback argument.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param ...args arguments to pass to the method; the callback will
 * be provided by Promise and appended to these arguments.
 * @returns a promise for the value or error
 */
Promise.ninvoke = function Promise_ninvoke(object, name /*...args*/) {
    var args = new Array(Math.max(0, arguments.length - 1));
    for (var index = 2; index < arguments.length; index++) {
        args[index - 2] = arguments[index];
    }
    var deferred = Promise_defer();
    args[index - 2] = deferred.makeNodeResolver();
    Promise_return(object).dispatch("invoke", [name, args]).catch(deferred.reject);
    return deferred.promise;
};

Promise.prototype.ninvoke = function Promise_ninvoke(name /*...args*/) {
    var args = new Array(arguments.length);
    for (var index = 1; index < arguments.length; index++) {
        args[index - 1] = arguments[index];
    }
    var deferred = Promise_defer();
    args[index - 1] = deferred.makeNodeResolver();
    this.dispatch("invoke", [name, args]).catch(deferred.reject);
    return deferred.promise;
};

/**
 * Wraps a Node.js continuation passing function and returns an equivalent
 * version that returns a promise.
 * @example
 * Promise.denodeify(FS.readFile)(__filename, "utf-8")
 * .then(console.log)
 * .done()
 */
Promise.denodeify = function Promise_denodeify(callback, pattern) {
    return function denodeified() {
        var args = new Array(arguments.length + 1);
        var index = 0;
        for (; index < arguments.length; index++) {
            args[index] = arguments[index];
        }
        var deferred = Promise_defer();
        args[index] = deferred.makeNodeResolver(pattern);
        Promise_return(callback).apply(this, args).catch(deferred.reject);
        return deferred.promise;
    };
};

/**
 * Creates a Node.js-style callback that will resolve or reject the deferred
 * promise.
 * @param unpack `true` means that the Node.js-style-callback accepts a
 * fixed or variable number of arguments and that the deferred should be resolved
 * with an array of these value arguments, or rejected with the error argument.
 * An array of names means that the Node.js-style-callback accepts a fixed
 * number of arguments, and that the resolution should be an object with
 * properties corresponding to the given names and respective value arguments.
 * @returns a nodeback
 */
Deferred.prototype.makeNodeResolver = function (unpack) {
    var resolve = this.resolve;
    if (unpack === true) {
        return function variadicNodebackToResolver(error) {
            if (error) {
                resolve(Promise_throw(error));
            } else {
                var value = new Array(Math.max(0, arguments.length - 1));
                for (var index = 1; index < arguments.length; index++) {
                    value[index - 1] = arguments[index];
                }
                resolve(value);
            }
        };
    } else if (unpack) {
        return function namedArgumentNodebackToResolver(error) {
            if (error) {
                resolve(Promise_throw(error));
            } else {
                var value = {};
                for (var index = 0; index < unpack.length; index++) {
                    value[unpack[index]] = arguments[index + 1];
                }
                resolve(value);
            }
        };
    } else {
        return function nodebackToResolver(error, value) {
            if (error) {
                resolve(Promise_throw(error));
            } else {
                resolve(value);
            }
        };
    }
};

/**
 * A utility that allows a function to produce a promise or use a Node.js style
 * codeback depending on whether the user provided one.
 */
Promise.prototype.nodeify = function Promise_nodeify(nodeback) {
    if (nodeback) {
        this.done(function (value) {
            nodeback(null, value);
        }, nodeback);
    } else {
        return this;
    }
};


}],["stream.js","gtor","stream.js",{"./task":34,"./promise":32,"./observable":28,"./promise-queue":31,"./iterator":27,"./iteration":26,"weak-map":55},function (require, exports, module, __filename, __dirname){

// gtor/stream.js
// --------------


// A stream represents either end of a buffer that transports values
// asynchronously in either direction.
// By convention, values are transported in one direction, and acknowledgements
// are returned.
//
// A stream is a promise iterator and a promise generator.
// All of the kernel methods, `yield` or `next`, `return`, and `throw`,
// both send and receive promises for iterations.
//
// Promise streams borrow the jargon of iterators and generators but each
// method is equivalent to a conventional stream method name.
//
// - `yield` is akin to `write`.
// - `next` is akin to `read`.
// - `yield` and `next` are interchangeable. The argument is written and the
//   return value is a promise for what will be read.
// - `return` is akin to `close`.
// - `throw` is akin to `abort`, `cancel`, or `destroy`.
//
// A stream is **unicast**, in the sense that it is a cooperation between a
// single producer and consumer, mediated by the buffer to control the
// throughput of both sides.
//
// Since a stream is unicast, it is also **cancelable**.
// Either side of a connection can terminate the other.

"use strict";

var Task = require("./task");
var Promise = require("./promise");
var Observable = require("./observable");
var PromiseQueue = require("./promise-queue");
var Iterator = require("./iterator");
var Iteration = require("./iteration");
var WeakMap = require("weak-map");

// Every stream has a private dual, the opposite end of the stream.
// For the input, there is the output; for the output, there is the input.
var duals = new WeakMap();
// Every stream has a private promise queue for transporting iterations.
// The stream uses its own queue to receive iterations from its dual, and uses
// the dual's queue to send iterations to its dual.
var queues = new WeakMap();

// ## Stream
//
// Like promises, streams use the [revealing constructor pattern][Revealing
// Constructor].
//
// [Revealing Constructor]: http://domenic.me/2014/02/13/the-revealing-constructor-pattern/
//
// However, unlike promises, streams are symmetric and support bidirectional
// communication.
// By convention, the stream constructor creates an output stream and reveals
// the methods of the input stream as arguments to a setup function.

module.exports = Stream;
function Stream(setup, length) {
    var buffer = Stream.buffer(length);
    setup(buffer.in.yield, buffer.in.return, buffer.in.throw);
    return buffer.out;
}

// The `buffer` constructor method of a stream creates a tangled pair of
// streams, dubbed `in` and `out`.
//
// The `buffer` method is analogous to `Promise.defer`.

Stream.buffer = function (length) {
    var outgoing = new PromiseQueue(); // syn
    var incoming = new PromiseQueue(); // ack
    var input = Object.create(Stream.prototype);
    var output = Object.create(Stream.prototype);
    duals.set(input, output);
    duals.set(output, input);
    queues.set(input, incoming);
    queues.set(output, outgoing);
    Stream_bind(input);
    Stream_bind(output);
    // If the user provides a buffer length, we prime the incoming message
    // queue (pre-acknowledgements) with that many iterations.
    // This allows the producer to stay this far ahead of the consumer.
    for (; length > 0; length--) {
        incoming.put(new Iteration());
    }
    // By contrast, if the buffer has a negative length, we prime the outgoing
    // message queue (data) with that many undefined iterations.
    // This gives some undefined values to the consumer, allowing it to proceed
    // before the producer has provided any iterations.
    for (; length < 0; length++) {
        outgoing.put(new Iteration());
    }
    return {in: input, out: output};
};

// The `from` method creates a stream from an iterable or a promise iterable.
Stream.from = function (iterable) {
    var stream = Object.create(Stream.prototype);
    var iterator = new Iterator(iterable);
    stream.yield = function (value, index) {
        return Promise.return(iterator.next(value, index));
    };
    Stream_bind(stream);
    return stream;
};

// The kernel methods of a stream are bound to the stream so they can be passed
// as free variables.
// Particularly, the methods of an input stream are revealed to the setup
// function of an output stream's constructor.
function Stream_bind(stream) {
    stream.next = stream.next.bind(stream);
    stream.yield = stream.yield.bind(stream);
    stream.return = stream.return.bind(stream);
    stream.throw = stream.throw.bind(stream);
}

Stream.prototype.Iteration = Iteration;

// ### Kernel Methods

// The `next` and `yield` methods are equivalent.
// By convention, `next` is used to consume, and `yield` to produce,
// but both methods have the same signature and behavior.
// They return a promise for the next iteration from the other side of the
// connection, and send an iteration with the given value to the other.

Stream.prototype.next = function (value, index) {
    return this.yield(value, index);
};

Stream.prototype.yield = function (value, index) {
    var dual = duals.get(this);
    var incoming = queues.get(this);
    var outgoing = queues.get(dual);
    outgoing.put(new this.Iteration(value, false, index));
    return incoming.get();
};

// The `return` method sends a final iteration to the other side of a stream,
// which by convention terminates communication in this direction normally.

Stream.prototype.return = function (value) {
    var dual = duals.get(this);
    var incoming = queues.get(this);
    var outgoing = queues.get(dual);
    outgoing.put(new this.Iteration(value, true));
    return incoming.get();
};

// The `throw` method sends an error to the other side of the stream,
// in an attempt to break communication in this direction, and, unless the
// other side handles the exception, the error should bounce back.

Stream.prototype.throw = function (error) {
    var dual = duals.get(this);
    var incoming = queues.get(this);
    var outgoing = queues.get(dual);
    outgoing.put(Promise.throw(error));
    return incoming.get();
};

// ### do

// The `do` method is a utility for `forEach` and `map`, responsible for
// setting up an appropriate semaphore for the concurrency limit.

Stream.prototype.do = function (callback, errback, limit) {
    var next;
    // If there is no concurrency limit, we are free to batch up as many jobs
    // as the producer can create.
    if (limit == null) {
        next = function () {
            return this.next()
            .then(function (iteration) {
                // Before even beginning the job, we start waiting for another
                // value.
                if (!iteration.done) {
                    next.call(this);
                }
                return callback(iteration);
            }, null, this)
        };
    } else {
        // If there is a concurrency limit, we will use a promise queue as a
        // semaphore.  We will enqueue a value representing a resource
        // (undefined) for each concurrent task.
        var semaphore = new PromiseQueue();
        while (limit--) {
            semaphore.put();
        }
        next = function () {
            // Whenever a resource is available from the queue, we will start
            // another job.
            return semaphore.get()
            .then(function (resource) {
                // Each job begins with waiting for a value from the iterator.
                return this.next()
                .then(function (iteration) {
                    // Once we have begun a job, we can begin waiting for
                    // another job.
                    // A resource may already be available on the queue.
                    if (!iteration.done) {
                        next.call(this);
                    }
                    // We pass the iteration forward to the callback, as
                    // defined by either `forEach` or `map`, to handle the
                    // iteration appropriately.
                    return Promise.try(callback, null, iteration)
                    .finally(function () {
                        // And when the job is complete, we will put a resource
                        // back on the semaphore queue, allowing another job to
                        // start.
                        semaphore.put(resource);
                    })
                }, null, this);
            }, null, this)
            .done(null, errback);
        }
    }
    next.call(this);
};

// ### pipe

// Copies all output of this stream to the input of the given stream, including
// the completion or any thrown errors.
// Some might call this `subscribe`.

Stream.prototype.pipe = function (stream) {
    // The default concurrency for `forEach` limit is 1, making it execute
    // serially.
    // We will use signals to track the number of outstanding jobs and whether
    // we have seen the last iteration.
    var count = Observable.signal(0);
    var done = Observable.signal(false);
    // We will capture the return value in scope.
    var returnValue;
    // Using the do utility function to limit concurrency and give us
    // iterations, or prematurely terminate, in which case we forward the error
    // to the result task.
    this.do(function (iteration) {
        // If this was the last iteration, capture the return value and
        // dispatch the done signal.
        if (iteration.done) {
            returnValue = iteration.value;
            done.in.yield(true);
        } else {
            // Otherwise, we start a new job.
            // Incrementing the number of outstanding jobs.
            count.in.inc();
            // Kick off the job, passing the callback argument pattern familiar
            // to users of arrays, but allowing the task to return a promise to
            // push back on the producer.
            return Promise.try(callback, thisp, iteration.value, iteration.index)
            .then(function (value) {
                return stream.yield(value);
            })
            .finally(function () {
                // And then decrementing the outstanding job counter,
                // regardless of whether the job succeeded.
                count.in.dec();
            })
        }
    }, stream.throw, limit);
    // We have not completed the task until all outstanding jobs have completed
    // and no more iterations are available.
    count.out.equals(Observable.yield(0)).and(done.out).forEach(function (done) {
        if (done) {
            stream.return(returnValue);
        }
    });
    return stream;
};


// ### forEach

// The `forEach` method will execute jobs, typically in serial, and returns a
// cancelable promise (`Task`) for the completion of all jobs.
// The default concurrency limit is 1, making `forEach` as serial as it is for
// arrays, but can be expanded by passing a number in the third argument
// position.

Stream.prototype.forEach = function (callback, thisp, limit) {
    // We create a task for the result.
    var result = Task.defer(function (error) {
        // If the task is canceled, we will propagate the error back to the
        // generator.
        this.throw(error);
    }, this);
    // The default concurrency for `forEach` limit is 1, making it execute
    // serially.
    // For other operators, `map` and `filter`, there is no inherent
    // parallelism limit.
    if (limit == null) { limit = 1; }
    // We will use signals to track the number of outstanding jobs and whether
    // we have seen the last iteration.
    var count = Observable.signal(0);
    var done = Observable.signal(false);
    // We will capture the return value in scope.
    var returnValue;
    // Using the do utility function to limit concurrency and give us
    // iterations, or prematurely terminate, in which case we forward the error
    // to the result task.
    this.do(function (iteration) {
        // If this was the last iteration, capture the return value and
        // dispatch the done signal.
        if (iteration.done) {
            returnValue = iteration.value;
            done.in.yield(true);
        } else {
            // Otherwise, we start a new job.
            // Incrementing the number of outstanding jobs.
            count.in.inc();
            // Kick off the job, passing the callback argument pattern familiar
            // to users of arrays, but allowing the task to return a promise to
            // push back on the producer.
            return Promise.try(callback, thisp, iteration.value, iteration.index)
            .finally(function () {
                // And then decrementing the outstanding job counter,
                // regardless of whether the job succeeded.
                count.in.dec();
            })
        }
    }, result.in.throw, limit);
    // We have not completed the task until all outstanding jobs have completed
    // and no more iterations are available.
    count.out.equals(Observable.yield(0)).and(done.out).forEach(function (done) {
        if (done) {
            result.in.return(returnValue);
        }
    });
    return result.out;
};

// ### map

// The `map` method runs jobs in parallel, taking values from this iterator and
// sending them to the returned promise iterator.
// There is no default limit to concurrency, but you can pass a number.
// Also, the order in which values pass from the input to the output is
// determined by how quickly the jobs are processed.
// However, the index of the input iterations propagates to the output
// iterations.
// A concurrency limit of 1 will ensure that order is preserved.

Stream.prototype.map = function (callback, thisp, limit) {
    // We use our own constructor so subtypes can alter behavior.
    var result = new this.constructor.buffer();
    // As with `forEach`, we track the number of outstanding jobs and whether
    // we have seen the last iteration.
    var count = Observable.signal(0);
    var done = Observable.signal(false);
    // And we will capture the return value here to pass it along to the result
    // stream.
    var returnValue;
    this.do(function (iteration) {
        // If this is the last iteration, track the return value and dispatch
        // the done signal.
        if (iteration.done) {
            returnValue = iteration.value;
            done.in.yield(true);
        } else {
            // Otherwise, start another job, first incrementing the outstanding
            // job counter so the result stream can't terminate until we are
            // done.
            count.in.inc();
            // Then pass the familiar argument pattern for map callbacks,
            // except allowing the job to return a promise for the result.
            return Promise.try(callback, thisp, iteration.value, iteration.index)
            .then(function (value) {
                // We forward the result to the output iterator, preserving its
                // index if not its order.
                return result.in.yield(value, iteration.index);
            })
            .finally(function () {
                // Regardless of whether the job succeeds or fails, we drop the
                // outstanding job count so the stream has an opportunity to
                // terminate if no more iterations are available.
                count.in.dec();
            });
        }
    }, result.in.throw, limit);
    // If no more iterations are available and all jobs are done, we can close
    // the output stream with the same return value as the input stream.
    count.out.equals(Observable.yield(0)).and(done.out).forEach(function (done) {
        if (done) {
            result.in.return(returnValue);
        }
    });
    return result.out;
};

// ### filter

// The filter method runs concurrent tests to determine whether to include an
// iteration from the input stream on the output stream.
// The regularity of the duration of the test will determine whether iterations
// are likely to be processed in order, but a concurrency limit of 1 guarantees
// that the input and output order will be the same.

Stream.prototype.filter = function (callback, thisp, limit) {
    var result = new this.constructor.buffer();
    // As with map and forEach, we use signals to track the termination
    // condition.
    var count = Observable.signal(0);
    var done = Observable.signal(false);
    var returnValue;
    this.do(function (iteration) {
        // If this is the last iteration, we track the return value to later
        // forward to the output stream and note that no more iterations are
        // available, pending any outstanding jobs.
        if (iteration.done) {
            returnValue = iteration.value;
            done.in.yield(true);
        } else {
            // Otherwise we start another job, incrementing the outstanding job
            // counter and using the usual filter argument pattern.
            count.in.inc();
            return Promise.try(callback, thisp, iteration.value, iteration.index)
            .then(function (value) {
                // Only if the test passes do we forward the value, and its
                // original index, to the output stream.
                if (value) {
                    return result.in.yield(iteration.value, iteration.index);
                }
            })
            .finally(function () {
                // Regardless of whether the test ran without error, we note
                // that the job is done.
                count.in.dec();
            });
        }
    }, result.in.throw, limit);
    /* when (count == 0 && done) */
    count.out.equals(Observable.yield(0)).and(done.out).forEach(function (done) {
        // When there are no more outstanding jobs and the input has been
        // exhausted, we forward the input return value to the output stream.
        if (done) {
            result.in.return(returnValue);
        }
    });
    return result.out;
};

// ### reduce

// The `reduce` method runs concurrent jobs to acrete values from the input
// stream until only one value remains, returning a cancelable promise (task)
// for that last value.
//
// Yet to be ported.

Stream.prototype.reduce = function (callback, limit) {
    var self = this;
    var result = Task.defer();
    var pool = Stream.buffer();

    var sempahore = new PromiseQueue();
    sempahore.put();

    var done = false;
    var size = 0;
    for (var index = 0; index < limit; index++) {
        next();
    }

    this.forEach(function (value) {
        return pool.in.yield(value);
    }).then(function (value) {
        return pool.in.return(value);
    }, function (error) {
        return pool.in.throw(error);
    });

    var active = 0;

    function next() {
        return sempahore.get()
        .then(function () {
            return pool.out.yield().then(function (left) {
                if (left.done) {
                    done = true;
                    sempahore.put();
                    next();
                    return;
                }
                if (done && active === 0) {
                    result.in.return(left.value);
                    return;
                }
                return pool.out.yield().then(function (right) {
                    sempahore.put();
                    if (right.done) {
                        next();
                        return pool.in.yield(left.value);
                    }
                    active++;
                    return Task.return()
                    .then(function () {
                        return callback(left.value, right.value);
                    })
                    .then(function (value) {
                        active--;
                        next();
                        return pool.in.yield(value);
                    });
                });
            });
        })
        .done(null, function (error) {
            result.in.throw(error);
        })
    }

    return result.out;
};

/* TODO some, every, takeWhile, dropWhile, concat */

// ### fork

// The fork method creates an array of streams that will all see every value
// from this stream.
// All of the returned streams put back pressure on this stream.
// This stream can only advance when all of the output streams have advanced.

Stream.prototype.fork = function (length) {
    length = length || 2;
    var ins = [];
    var outs = [];
    for (var index = 0; index < length; index++) {
        var buffer = this.constructor.buffer();
        ins.push(buffer.in);
        outs.push(buffer.out);
    }
    this.forEach(function (value, index) {
        return Promise.all(ins.map(function (input) {
            return input.yield(value, index);
        }));
    }).then(function (value) {
        return Promise.all(ins.map(function (input) {
            return input.return(value);
        }));
    }, function (error) {
        return Promise.all(ins.map(function (input) {
            return input.throw(value);
        }));
    }).done();
    return outs;
};

// ### relieve

// If we consume this stream more slowly than it produces iterations, pressure
// will accumulate between the consumer and the producer, slowing the producer.
// The `relieve` method alleviates this pressure.
// This stream will be allowed to produce values as quickly as it can,
// and the returned stream will lose intermediate values if it can not keep up.
// The consumer will only see the most recent value from the producer upon
// request.
// However, if the consumer is faster than the producer, the relief will have no
// effect.

Stream.prototype.relieve = function () {
    var current = Promise.defer();
    this.forEach(function (value, index) {
        current.resolver.return(new Iteration(value, false));
        current = Promise.defer();
    })
    .done(function (value) {
        current.resolver.return(new Iteration(value, true));
    }, current.resolver.throw);
    return Stream.from(function () {
        return current.promise;
    });
};

}],["task.js","gtor","task.js",{"asap":0,"weak-map":55},function (require, exports, module, __filename, __dirname){

// gtor/task.js
// ------------

"use strict";

// A Task is a cancelable variant of a promise.
// Like a promise, the observable is a proxy for the result of some work.
// The interface is largely the same, but a observable can only have one
// observer.
// For example, calling `then` a second time will throw an error.
// Instead, if a task has multiple observers, you can sacrifice cancelability
// by coercing it to a promise, or use `fork` before observing it.
// If every fork is cancelled, the cancelation will propagate back to the
// original job.
//
// The price of cancelability is a less robust system and more book keeping.
// A system that makes a great deal of use of tasks allows information to flow
// from any observable to any related task, even if distantly related.
// The cancelation of one task can propagate throughout an entire system of
// tasks, both forward and backward between consumers and producers.
// In exchange the system gains the ability to either free or avoid consuming
// resources proactively.

var asap = require("asap");
var WeakMap = require("weak-map");

// ## Task
//
// The consumer side of a task should receive the task's observable.
// This object provides the ability to register exactly one observer for the
// result of the task, and the ability to cancel the task with an error.

function Task(setup, thisp) {
    var deferred = Task.defer();
    var handler = handlers.get(deferred.out);
    handler.cancel = setup.call(thisp, deferred.in.return, deferred.in.throw);
    return deferred.out;
}

/*
TODO Task.prototype = Object.create(Observable);
Such that it is possible to create parallel signaling for status and estimated
time to completion, or other arbitrary signals from the resolver to the
observable.
*/

// The `done` method registers an observer for any combination of completion or
// failure with the given methods and optional context object.
// The `done` method does not return a new task and does not capture errors
// thrown by the observer methods.
Task.prototype.done = function (onreturn, onthrow, thisp) {
    var self = this;
    var handler = Task_getHandler(self);
    handler.done(onreturn, onthrow, thisp);
};

// The `then` method registers an observer for any combination of completion or
// failure, and creates a new task that will be completed with the result of
// either the completion or failure handler.
Task.prototype.then = function (onreturn, onthrow, thisp) {
    // TODO accept status and estimated time to completion arguments in
    // arbitrary order.
    var handler = Task_getHandler(this);
    var task = Task.defer(this.cancel, this);
    var _onreturn, _onthrow;
    if (typeof onreturn === "function") {
        _onreturn = function (value) {
            try {
                task.in.return(onreturn.call(thisp, value));
            } catch (error) {
                task.in.throw(error);
            }
        };
    }
    if (typeof onthrow === "function") {
        _onthrow = function (error) {
            try {
                task.in.return(onthrow.call(thisp, error));
            } catch (error) {
                task.in.throw(error);
            }
        };
    }
    this.done(_onreturn, _onthrow);
    return task.out;
};

// The `spread` method fills a temporary need to be able to spread an array
// into the arguments of the completion handler of a `then` observer.
// ECMAScript 6 introduces the ability to spread arguments into an array in the
// signature of the method.
Task.prototype.spread = function (onreturn, onthrow, thisp) {
    return this.then(function (args) {
        return onreturn.apply(thisp, args);
    }, onthrow, thisp);
};

// The `catch` method registers an error observer on a task and returns a new
// task to be completed with the result of the observer.
// The observer may return another task or thenable to transfer responsibility
// to complete this task to another stage of the process.
Task.prototype.catch = function (onthrow, thisp) {
    return this.then(null, onthrow, thisp);
};

// The `finally` method registers an observer for when the task either
// completes or fails and returns a new task to perform some further work but
// forward the original value or error otherwise.
Task.prototype.finally = function (onsettle, thisp) {
    return this.then(function (value) {
        return onsettle.call(thisp).then(function Task_finally_value() {
            return value;
        })
    }, function (error) {
        return onsettle.call(thisp).then(function Task_finally_error() {
            throw error;
        });
    });
};

// The `get` method creates a task that will get a property of the completion
// object for this task.
Task.prototype.get = function (key) {
    return task.then(function (object) {
        return object[key];
    });
};

// The `call` method creates a task that will call the function that is the
// completion value of this task with the given spread arguments.
Task.prototype.call = function (thisp /*, ...args*/) {
    var args = [];
    for (var index = 1; index < arguments.length; index++) {
        args[index - 1] = arguments[index];
    }
    return task.then(function (callable) {
        return callable.apply(thisp, args);
    });
};

// The `invoke` method creates a task that will invoke a property of the
// completion object for this task.
Task.prototype.invoke = function (name /*, ...args*/) {
    var args = [];
    for (var index = 1; index < arguments.length; index++) {
        args[index - 1] = arguments[index];
    }
    return task.then(function (object) {
        return object[name].apply(object, args);
    });
};

// The `thenReturn` method registers an observer for the completion of this
// task and returns a task that will be completed with the given value when
// this task is completed.
Task.prototype.thenReturn = function (value) {
    return this.then(function () {
        return value;
    });
};

// The `thenReturn` method registers an observer for the completion of this
// task and returns a task that will fail with the given error when this task
// is completed.
Task.prototype.thenThrow = function (error) {
    return this.then(function () {
        return error;
    });
};

// Effects cancelation from the consumer side.
Task.prototype.throw = function (error) {
    var handler = Task_getHandler(this);
    if (handler.cancel) {
        handler.throw(error);
    }
};

// A task can only be observed once, but it can be forked.
// The `fork` method returns a new task that will observe the same completion
// or failure of this task.
// Hereafter, this task and all forked tasks must *all* be cancelled for this
// task's canceller to propagate.
Task.prototype.fork = function () {
    // The fork method works by fiddling with the handler of this task.
    // First, we extract this task's handler and make it the new parent for two
    // child tasks.
    var parentHandler = Task_getHandler(this);
    parentHandler.done(function (value) {
        left.in.return(value);
        right.in.return(value);
    }, function (error) {
        left.in.throw(error);
        right.in.throw(error);
    });
    /* TODO estimated time to completion forwarding */
    /* TODO use a signal operator to propagate cancellation */
    var leftCanceled = false, rightCanceled = false;
    var left = Task.defer(function (error) {
        if (leftCanceled) {
            return;
        }
        leftCanceled = true;
        if (rightCanceled) {
            parentHandler.throw(error);
        }
    });
    var right = Task.defer(function (error) {
        if (rightCanceled) {
            return;
        }
        rightCanceled = true;
        if (leftCanceled) {
            parentHandler.throw(error);
        }
    });
    // We replace our own handler with the left child
    handlers.set(this, Task_getHandler(left.out));
    // And return the task with the right child handler
    return right.out;
};

// The `delay` method of a task adds a delay of some miliseconds after the task
// *completes*.
// Cancelling the delayed task will cancel either the delay or the delayed
// task.
Task.prototype.delay = function (ms) {
    var self = this;
    var task = Task.defer(function cancelDelayedTask() {
        self.throw();
        clearTimeout(handle);
    });
    var result = Task.defer();
    var handle = setTimeout(function taskDelayed() {
        task.in.return(result.out);
    }, ms);
    this.done(function (value) {
        result.in.return(value);
    }, function (error) {
        task.in.throw(error);
    });
    return task.out;
};

// The `timeout` method will automatically cancel a task if it takes longer
// than a given delay in miliseconds.
Task.prototype.timeout = function (ms, message) {
    var self = this;
    var task = Task.defer(function cancelTimeoutTask() {
        this.throw();
        clearTimeout(handle);
    }, this);
    var handle = setTimeout(function Task_timeout() {
        self.throw();
        task.in.throw(new Error(message || "Timed out after " + ms + "ms"));
    }, ms);
    this.done(function Task_timeoutValue(value) {
        clearTimeout(handle);
        task.in.return(value);
    }, function Task_timeoutError(error) {
        clearTimeout(handle);
        task.in.throw(error);
    });
    return task.out;
};


// ## Completer
//
// The producer side of a task should get a reference to a task's resolver.
// The object provides the capability to settle the task with a completion
// value or a failure error.

function Completer(handler) {
    // The task resolver implicitly binds its return and throw methods so these
    // can be passed as free functions.
    this.return = this.return.bind(this);
    this.throw = this.throw.bind(this);
}

// The `return` method sets the tasks state to "fulfilled" (in the words of
// promises) or "completed" (in the vernacular of tasks), with a given value.
// If the corresponding observer was registered already, this will inform
// the observer as soon as possible.
// If the corresponding observer gets registered later, it will receive the
// result as soon as possible thereafter.
Completer.prototype.return = function (value) {
    var handler = Task_getHandler(this);
    handler.become(Task.return(value));
};

// The `throw` method sets the tasks state to "rejected" (a term borrowed from
// promises) or "failed" (the corresponding task jargon), with the given error.
// Again, if the corresponding observer was registered already, this will
// inform the observer as soon as possible.
// If the corresponding observer gets registered later, it will receive the
// result as soon as possible thereafter.
Completer.prototype.throw = function (error) {
    var handler = Task_getHandler(this);
    handler.become(Task.throw(error));
};


// ## Task
//
// The task constructor creates a resolver "in" and an observer "out" pair
// with some shared internal state.
// Particularly, since tasks can be canceled, the task constructor accepts a
// reference to the cancellation method and optionally the instance that hosts
// it.

module.exports = Task;
Task.defer = function (cancel, thisp) { // TODO estimate, label
    var handler = new TaskHandler(); // TODO polymorph constructors
    var input = Object.create(Completer.prototype);
    var output = Object.create(Task.prototype);
    Completer_bind(input);
    handlers.set(input, handler);
    handlers.set(output, handler);
    handler.cancel = cancel;
    handler.cancelThisp = thisp;
    return {in: input, out: output};
}

function Completer_bind(completer) {
    completer.return = completer.return.bind(completer);
    completer.throw = completer.throw.bind(completer);
};

// The `isTask` utility method allows us to identify a task that was
// constructed by this library.
// This library does not attempt to make it provably impossible to trick the
// Task.
Task.isTask = isTask;
function isTask(object) {
    return (
        Object(object) === object &&
        !!handlers.get(object) &&
        object instanceof Task
    );
};

// The `isThenable` method is used internally to identify other singular
// asynchronous duck types, including promises, which can be coerced into
// tasks.
function isThenable(object) {
    return object && typeof object === "object" && typeof object.then === "function";
}

// The `return` function lifts a value into a task that has already completed
// with a value.
Task.return = function (value) {
    if (isTask(value)) {
        return value;
    } else if (isThenable(value)) {
        // FIXME sloppy with closures and should use weakmap of value to task
        var deferred = Task.defer();
        asap(function () {
            value.then(function (value) {
                deferred.in.return(value);
            }, function (error) {
                deferred.in.throw(value);
            });
        });
        return deferred.out;
    } else {
        var handler = new TaskHandler();
        handler.state = "fulfilled";
        handler.value = value;
        var task = Object.create(Task.prototype);
        handlers.set(task, handler);
        return task;
    }
};

// The `throw` function lifts an error into a task that has already failed with
// that error.
Task.throw = function (error) {
    var handler = new TaskHandler();
    handler.state = "rejected";
    handler.error = error;
    var task = Object.create(Task.prototype);
    handlers.set(task, handler);
    return task;
};

// The `all` function accepts an array of tasks, or values that can be coerced
// into tasks, and produces a task that when completed will produce an array of
// the individual completion values.
Task.all = function Task_all(tasks) {
    // If the task is cancelled, or if any individual task fails, all of the
    // outstanding individual tasks will be cancelled.
    function cancelAll(error) {
        for (var otherIndex = 0; otherIndex < tasks.length; otherIndex++) {
            // Note that throwing an error upstream consitutes talking back to the producer.
            // This is a reminder that tasks are a cooperation between a single
            // consumer and a single producer and that information flows both
            // ways and in fact allows information to propagate laterally by
            // passing up one stream and down another.
            tasks[otherIndex].throw(error);
        }
        result.in.throw(error);
    }
    // The number of outstanding tasks, tracked to determine when all tasks are
    // completed.
    var remaining = tasks.length;
    var result = Task.defer(cancelAll);
    var results = Array(tasks.length);
    /* TODO estimated time to completion, label signals */
    var estimates = [];
    var estimate = -Infinity;
    var setEstimate;
    var estimates = tasks.map(function Task_all_each(task, index) {
        task = tasks[index] = Task.return(task); // Coerce values to tasks
        task.done(function Task_all_anyReturn(value) {
            results[index] = value;
            if (--remaining === 0) {
                result.in.return(results);
            }
        }, cancelAll);
    });
    return result.out;
};

// The `any` method accepts an array of tasks, or value coercable to tasks, and
// returns a task that will receive the value from the first task that
// completes with a value.
// After one succeeds, all remaining tasks will be cancelled.
// If one of the tasks fails, it will be ignored.
// If all tasks fail, this task will fail with the last error.
Task.any = function (tasks) {
    /* TODO */
};

// The `any` method accepts an array of tasks, or value coercable to tasks, and
// returns a task that will receive the value or error of the first task that
// either completes or fails.
// Afterward, all remaining tasks will be cancelled.
Task.race = function (tasks) {
    /* TODO */
};

// The `delay` method accepts a duration of time in miliseconds and returns a
// task that will complete with the given value after that amount of time has
// elapsed.
Task.delay = function (ms, value) {
    return Task.return(value).delay(ms);
};

// ## TaskHandler

// The resolver and observable side of a task share a hidden internal record
// with their shared state.
// Handlers are an alternative to using closures.
var handlers = new WeakMap();

function TaskHandler() {
    // When a task is resolved, it "becomes" a different task and its
    // observable, if any, must be forwarded to the new task handler.
    // In the `become` method, we also adjust the "handlers" table so any
    // subsequent request for this handler jumps to the end of the "became"
    // chain.
    this.became = null;
    // Tasks may be created with a corresponding canceler.
    this.cancel = null;
    this.cancelThisp = null;
    // Tasks may be "pending", "fulfilled" with a value, or "rejected" with an
    // error
    this.state = "pending";
    this.value = null;
    this.error = null;
    // A task may only be observed once.
    // Any future attempt to observe a task will throw an error.
    this.observed = false;
    // Since a task can only be observed once, we only need to track one
    // handler for fulfillment with a value or rejection with an error.
    // A promise keeps an array of handlers to forward messages to.
    // These handlers can be forgotten once a task settles since thereafter
    // the observer would be informed immediately.
    this.onreturn = null;
    this.onthrow = null;
    // The object to use as `this` in the context of `onreturn` and `onthrow`.
    this.thisp = null;
}

// Since a task handler can become another task handler, this utility method
// will look up the end of the chain of "became" properties and rewrite the
// handler look up table so we never have to walk the same length of chain
// again.
function Task_getHandler(task) {
    var handler = handlers.get(task);
    while (handler && handler.became) {
        handler = handler.became;
    }
    handlers.set(task, handler);
    return handler;
}

// The `done` method is kernel for subscribing to a task observer.
// If the task has already completed or failed, this will also arrange for the
// observer to be notified as soon as possible.
TaskHandler.prototype.done = function (onreturn, onthrow, thisp) {
    if (this.observed) {
        throw new Error("Can't observe a task multiple times. Use fork");
    }
    this.observed = true;
    this.onreturn = onreturn;
    this.onthrow = onthrow;
    this.thisp = thisp;
    // If we are observing a task after it completed or failed, we dispatch the
    // result immediately.
    if (this.state !== "pending") {
        // Instead of passing a callable closure, we pass ourself to avoid
        // allocating another object.
        // The task handler serves as a psuedo-function by implementing "call".
        asap(this);
    }
    // We handle the case of observing *before* completion or failure in the
    // `become` method.
};

// Above, we pass the task handler to `asap`.
// The event dispatcher treats functions and callable objects alike.
// This method will get called if this task has settled into a "fulfilled" or
// "rejected" state so we can call the appropriate handler.
TaskHandler.prototype.call = function () {
    if (this.state === "fulfilled") {
        if (this.onreturn) {
            this.onreturn.call(this.thisp, this.value);
        }
    } else if (this.state === "rejected") {
        if (this.onthrow) {
            this.onthrow.call(this.thisp, this.error);
        } else {
            throw this.error;
        }
    }
    // We release the handlers so they can be potentially garbage collected.
    this.onreturn = null;
    this.onthrow = null;
    this.thisp = null;
};

// The `become` method is the kernel of the task resolver.
TaskHandler.prototype.become = function (task) {
    var handler = Task_getHandler(task);
    // A task can only be resolved once.
    // Subsequent resolutions are ignored.
    // Ignoring, rather than throwing an error, greatly simplifies a great
    // number of cases, like racing tasks and cancelling tasks, where handling
    // an error would be unnecessary and inconvenient.
    if (this.state !== "pending") {
        return;
    }
    // The `became` property gets used by the internal handler getter to
    // rewrite the handler table and shorten chains.
    this.became = handler;
    // Once a task completes or fails, we no longer need to retain the
    // canceler.
    this.cancel = null;
    this.cancelThisp = null;
    // If an observer subscribed before it completed or failed, we forward the
    // resolution.
    // If an observer subscribes later, we take care of that case in `done`.
    if (this.observed) {
        handler.done(this.onreturn, this.onthrow, this.thisp);
    }
};

// The `throw` method is used by the promise observer to cancel the task from
// the consumer side.
TaskHandler.prototype.throw = function (error) {
    if (this.cancel) {
        this.cancel.call(this.cancelThisp);
    }
    this.become(Task.throw(error || new Error("Consumer canceled task")));
};


}],["choose.html","gutentag","choose.html",{"./choose":36},function (require, exports, module, __filename, __dirname){

// gutentag/choose.html
// --------------------

"use strict";
module.exports = (require)("./choose");

}],["choose.js","gutentag","choose.js",{},function (require, exports, module, __filename, __dirname){

// gutentag/choose.js
// ------------------

"use strict";

module.exports = Choose;
function Choose(body, scope) {
    this.choices = scope.argument.children;
    this.choice = null;
    this.choiceBody = null;
    this.choiceScope = null;
    this.body = body;
    this.scope = scope;
    this._value = null;
}

Object.defineProperty(Choose.prototype, "value", {
    get: function () {
        return this._value;
    },
    set: function (value) {
        if (!this.choices[value]) {
            throw new Error("Can't switch to non-existant option");
        }

        if (value === this._value) {
            return;
        }
        this._value = value;

        if (this.choice) {
            if (this.choice.destroy) {
                this.choice.destroy();
            }
            this.body.removeChild(this.choiceBody);
        }

        this.choiceBody = this.body.ownerDocument.createBody();
        this.choiceScope = this.scope.nestComponents();
        this.choice = new this.choices[value](this.choiceBody, this.choiceScope);
        this.choiceScope.set(this.scope.id + ":" + value, this.choice);
        this.body.appendChild(this.choiceBody);
    }
});


Choose.prototype.destroy = function () {
    for (var name in this.options) {
        var child = this.options[name];
        if (child.destroy) {
            child.destroy();
        }
    }
};

}],["document.js","gutentag","document.js",{"koerper":43},function (require, exports, module, __filename, __dirname){

// gutentag/document.js
// --------------------

"use strict";
module.exports = require("koerper");

}],["repeat.html","gutentag","repeat.html",{"./repeat":39},function (require, exports, module, __filename, __dirname){

// gutentag/repeat.html
// --------------------

"use strict";
module.exports = (require)("./repeat");

}],["repeat.js","gutentag","repeat.js",{"pop-observe":47,"pop-swap":52},function (require, exports, module, __filename, __dirname){

// gutentag/repeat.js
// ------------------


var O = require("pop-observe");
var swap = require("pop-swap");

var empty = [];

module.exports = Repetition;
function Repetition(body, scope) {
    this.body = body;
    this.scope = scope;
    this.iterations = [];
    this.Iteration = scope.argument.component;
    this.id = scope.id;
    this.observer = null;
    this._value = null;
    this.value = [];
}

Object.defineProperty(Repetition.prototype, "value", {
    get: function () {
        return this._value;
    },
    set: function (value) {
        if (!Array.isArray(value)) {
            throw new Error('Value of repetition must be an array');
        }
        if (this.observer) {
            this.observer.cancel();
            this.handleValueRangeChange(empty, this._value, 0);
        }
        this._value = value;
        this.handleValueRangeChange(this._value, empty, 0);
        this.observer = O.observeRangeChange(this._value, this, "value");
    }
});

Repetition.prototype.handleValueRangeChange = function (plus, minus, index) {
    var body = this.body;
    var document = this.body.ownerDocument;

    this.iterations.slice(index, index + minus.length)
    .forEach(function (iteration, offset) {
        body.removeChild(iteration.body);
        iteration.value = null;
        iteration.index = null;
        iteration.body = null;
        if (iteration.destroy) {
            iteration.destroy();
        }
    }, this);

    var nextIteration = this.iterations[index + 1];
    var nextSibling = nextIteration && nextIteration.body;

    swap(this.iterations, index, minus.length, plus.map(function (value, offset) {
        var iterationNode = document.createBody();
        var iterationScope = this.scope.nestComponents();

        var iteration = new this.Iteration(iterationNode, iterationScope);
        iteration.value = value;
        iteration.index = index + offset;
        iteration.body = iterationNode;

        iterationScope.set(this.scope.id + ":iteration", iteration);

        body.insertBefore(iterationNode, nextSibling);
        return iteration;
    }, this));

    this.updateIndexes(index);
};

Repetition.prototype.updateIndexes = function (index) {
    for (var length = this.iterations.length; index < length; index++) {
        this.iterations[index].index = index;
    }
};

Repetition.prototype.redraw = function (region) {
    this.iterations.forEach(function (iteration) {
        iteration.redraw(region);
    }, this);
};

Repetition.prototype.destroy = function () {
    this.observer.cancel();
    this.handleValuesRangeChange([], this._value, 0);
};


}],["scope.js","gutentag","scope.js",{},function (require, exports, module, __filename, __dirname){

// gutentag/scope.js
// -----------------

"use strict";

module.exports = Scope;
function Scope() {
    this.root = this;
    this.components = Object.create(null);
}

Scope.prototype.nest = function () {
    var child = Object.create(this);
    child.parent = this;
    child.caller = this.caller && this.caller.nest();
    return child;
};

Scope.prototype.nestComponents = function () {
    var child = this.nest();
    child.components = Object.create(this.components);
    return child;
};

Scope.prototype.set = function (id, component) {
    var scope = this;
    scope.components[id] = component;

    if (scope.this.add) {
        scope.this.add(component, id, scope);
    }

    var exportId = scope.this.exports && scope.this.exports[id];
    if (exportId) {
        var callerId = scope.caller.id;
        scope.caller.set(callerId + ":" + exportId, component);
    }
};

}],["text.html","gutentag","text.html",{"./text":42},function (require, exports, module, __filename, __dirname){

// gutentag/text.html
// ------------------

"use strict";
module.exports = (require)("./text");

}],["text.js","gutentag","text.js",{},function (require, exports, module, __filename, __dirname){

// gutentag/text.js
// ----------------

"use strict";

module.exports = Text;
function Text(body, scope) {
    var node = body.ownerDocument.createTextNode("");
    body.appendChild(node);
    this.node = node;
    this.defaultText = scope.argument.innerText;
    this._value = null;
}

Object.defineProperty(Text.prototype, "value", {
    get: function () {
        return this._value;
    },
    set: function (value) {
        this._value = value;
        if (value == null) {
            this.node.data = this.defaultText;
        } else {
            this.node.data = "" + value;
        }
    }
});

}],["koerper.js","koerper","koerper.js",{"wizdom":56},function (require, exports, module, __filename, __dirname){

// koerper/koerper.js
// ------------------

"use strict";

var BaseDocument = require("wizdom");
var BaseNode = BaseDocument.prototype.Node;
var BaseElement = BaseDocument.prototype.Element;
var BaseTextNode = BaseDocument.prototype.TextNode;

module.exports = Document;
function Document(actualNode) {
    Node.call(this, this);
    this.actualNode = actualNode;
    this.actualDocument = actualNode.ownerDocument;

    this.documentElement = this.createBody();
    this.documentElement.parentNode = this;
    actualNode.appendChild(this.documentElement.actualNode);

    this.firstChild = this.documentElement;
    this.lastChild = this.documentElement;
}

Document.prototype = Object.create(BaseDocument.prototype);
Document.prototype.Node = Node;
Document.prototype.Element = Element;
Document.prototype.TextNode = TextNode;
Document.prototype.Body = Body;
Document.prototype.OpaqueHtml = OpaqueHtml;

Document.prototype.createBody = function (label) {
    return new this.Body(this, label);
};

Document.prototype.getActualParent = function () {
    return this.actualNode;
};

function Node(document) {
    BaseNode.call(this, document);
    this.actualNode = null;
}

Node.prototype = Object.create(BaseNode.prototype);
Node.prototype.constructor = Node;

Node.prototype.insertBefore = function insertBefore(childNode, nextSibling) {
    if (nextSibling && nextSibling.parentNode !== this) {
        throw new Error("Can't insert before node that is not a child of parent");
    }
    BaseNode.prototype.insertBefore.call(this, childNode, nextSibling);
    var actualParentNode = this.getActualParent();
    var actualNextSibling;
    if (nextSibling) {
        actualNextSibling = nextSibling.getActualFirstChild();
    }
    if (!actualNextSibling) {
        actualNextSibling = this.getActualNextSibling();
    }
    if (actualNextSibling && actualNextSibling.parentNode !== actualParentNode) {
        actualNextSibling = null;
    }
    actualParentNode.insertBefore(childNode.actualNode, actualNextSibling || null);
    childNode.inject();
    return childNode;
};

Node.prototype.removeChild = function removeChild(childNode) {
    if (!childNode) {
        throw new Error("Can't remove child " + childNode);
    }
    childNode.extract();
    this.getActualParent().removeChild(childNode.actualNode);
    BaseNode.prototype.removeChild.call(this, childNode);
};

Node.prototype.setAttribute = function setAttribute(key, value) {
    this.actualNode.setAttribute(key, value);
};

Node.prototype.getAttribute = function getAttribute(key) {
    this.actualNode.getAttribute(key);
};

Node.prototype.hasAttribute = function hasAttribute(key) {
    this.actualNode.hasAttribute(key);
};

Node.prototype.removeAttribute = function removeAttribute(key) {
    this.actualNode.removeAttribute(key);
};

Node.prototype.addEventListener = function addEventListener(name, handler, capture) {
    this.actualNode.addEventListener(name, handler, capture);
};

Node.prototype.removeEventListener = function removeEventListener(name, handler, capture) {
    this.actualNode.removeEventListener(name, handler, capture);
};

Node.prototype.inject = function injectNode() { };

Node.prototype.extract = function extractNode() { };

Node.prototype.getActualParent = function () {
    return this.actualNode;
};

Node.prototype.getActualFirstChild = function () {
    return this.actualNode;
};

Node.prototype.getActualNextSibling = function () {
    return null;
};

Object.defineProperty(Node.prototype, "innerHTML", {
    get: function () {
        return this.actualNode.innerHTML;
    }//,
    //set: function (html) {
    //    // TODO invalidate any subcontained child nodes
    //    this.actualNode.innerHTML = html;
    //}
});

function Element(document, type) {
    BaseNode.call(this, document);
    this.tagName = type;
    this.actualNode = document.actualDocument.createElement(type);
    this.attributes = this.actualNode.attributes;
}

Element.prototype = Object.create(Node.prototype);
Element.prototype.constructor = Element;
Element.prototype.nodeType = 1;

function TextNode(document, text) {
    Node.call(this, document);
    this.actualNode = document.actualDocument.createTextNode(text);
}

TextNode.prototype = Object.create(Node.prototype);
TextNode.prototype.constructor = TextNode;
TextNode.prototype.nodeType = 3;

Object.defineProperty(TextNode.prototype, "data", {
    set: function (data) {
        this.actualNode.data = data;
    },
    get: function () {
        return this.actualNode.data;
    }
});

// if parentNode is null, the body is extracted
// if parentNode is non-null, the body is inserted
function Body(document, label) {
    Node.call(this, document);
    this.actualNode = document.actualDocument.createTextNode("");
    //this.actualNode = document.actualDocument.createComment(label || "");
    this.actualFirstChild = null;
    this.actualBody = document.actualDocument.createElement("BODY");
}

Body.prototype = Object.create(Node.prototype);
Body.prototype.constructor = Body;
Body.prototype.nodeType = 13;

Body.prototype.extract = function extract() {
    var body = this.actualBody;
    var lastChild = this.actualNode;
    var parentNode = this.parentNode.getActualParent();
    var at = this.getActualFirstChild();
    var next;
    while (at && at !== lastChild) {
        next = at.nextSibling;
        if (body) {
            body.appendChild(at);
        } else {
            parentNode.removeChild(at);
        }
        at = next;
    }
};

Body.prototype.inject = function inject() {
    if (!this.parentNode) {
        throw new Error("Can't inject without a parent node");
    }
    var body = this.actualBody;
    var lastChild = this.actualNode;
    var parentNode = this.parentNode.getActualParent();
    var at = body.firstChild;
    var next;
    while (at) {
        next = at.nextSibling;
        parentNode.insertBefore(at, lastChild);
        at = next;
    }
};

Body.prototype.getActualParent = function () {
    if (this.parentNode) {
        return this.parentNode.getActualParent();
    } else {
        return this.actualBody;
    }
};

Body.prototype.getActualFirstChild = function () {
    if (this.firstChild) {
        return this.firstChild.getActualFirstChild();
    }
};

Body.prototype.getActualNextSibling = function () {
    return this.actualNode;
};

Object.defineProperty(Body.prototype, "innerHTML", {
    get: function () {
        if (this.parentNode) {
            this.extract();
            var html = this.actualBody.innerHTML;
            this.inject();
            return html;
        } else {
            return this.actualBody.innerHTML;
        }
    },
    set: function (html) {
        if (this.parentNode) {
            this.extract();
            this.actualBody.innerHTML = html;
            this.firstChild = this.lastChild = new OpaqueHtml(
                this.ownerDocument,
                this.actualBody
            );
            this.inject();
        } else {
            this.actualBody.innerHTML = html;
            this.firstChild = this.lastChild = new OpaqueHtml(
                this.ownerDocument,
                this.actualBody
            );
        }
        return html;
    }
});

function OpaqueHtml(ownerDocument, body) {
    Node.call(this, ownerDocument);
    this.actualFirstChild = body.firstChild;
}

OpaqueHtml.prototype = Object.create(Node.prototype);
OpaqueHtml.prototype.constructor = OpaqueHtml;

OpaqueHtml.prototype.getActualFirstChild = function getActualFirstChild() {
    return this.actualFirstChild;
};

}],["point.js","ndim","point.js",{},function (require, exports, module, __filename, __dirname){

// ndim/point.js
// -------------

"use strict";

module.exports = Point;
function Point() {
}

Point.prototype.add = function (that) {
    return this.clone().addThis(that);
};

Point.prototype.sub = function (that) {
    return this.clone().addThis(that);
};

// not dot or cross, just elementwise multiplication
Point.prototype.mul = function (that) {
    return this.clone().mulThis(that);
};

Point.prototype.scale = function (n) {
    return this.clone().scaleThis(n);
};

Point.prototype.bitwiseAnd = function (n) {
    return this.clone().bitwiseAndThis(n);
};

Point.prototype.bitwiseOr = function (n) {
    return this.clone().bitwiseOrThis(n);
};

Point.prototype.round = function () {
    return this.clone().roundThis();
};

Point.prototype.floor = function () {
    return this.clone().floorThis();
};

Point.prototype.ceil = function () {
    return this.clone().ceilThis();
};

Point.prototype.abs = function () {
    return this.clone().absThis();
};

Point.prototype.min = function () {
    return this.clone().minThis();
};

Point.prototype.max = function () {
    return this.clone().maxThis();
};


}],["point2.js","ndim","point2.js",{"./point":44},function (require, exports, module, __filename, __dirname){

// ndim/point2.js
// --------------

"use strict";

var Point = require("./point");

module.exports = Point2;
function Point2(x, y) {
    this.x = x;
    this.y = y;
}

Point2.prototype = Object.create(Point.prototype);
Point2.prototype.constructor = Point2;

Point2.zero = new Point2(0, 0);
Point2.one = new Point2(1, 1);

Point2.prototype.addThis = function (that) {
    this.x = this.x + that.x;
    this.y = this.y + that.y;
    return this;
};

Point2.prototype.subThis = function (that) {
    this.x = this.x - that.x;
    this.y = this.y - that.y;
    return this;
};

Point2.prototype.mulThis = function (that) {
    this.x = this.x * that.x;
    this.y = this.y * that.y;
    return this;
};

Point2.prototype.scaleThis = function (n) {
    this.x = this.x * n;
    this.y = this.y * n;
    return this;
};

Point2.prototype.distance = function () {
    return Math.sqrt(this.x * this.x + this.y * this.y);
};

Point2.prototype.bitwiseAndThis = function (n) {
    this.x = this.x & n;
    this.y = this.y & n;
    return this;
};

Point2.prototype.bitwiseOrThis = function (n) {
    this.x = this.x | n;
    this.y = this.y | n;
    return this;
};

Point2.prototype.dot = function (that) {
    return this.x * that.x + this.y * that.y;
};

Point2.prototype.roundThis = function () {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    return this;
};

Point2.prototype.floorThis = function () {
    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
    return this;
};

Point2.prototype.ceilThis = function () {
    this.x = Math.ceil(this.x);
    this.y = Math.ceil(this.y);
    return this;
};

Point2.prototype.absThis = function () {
    this.x = Math.abs(this.x);
    this.y = Math.abs(this.y);
};

Point2.prototype.minThis = function (that) {
    this.x = Math.min(this.x, that.x);
    this.y = Math.min(this.y, that.y);
};

Point2.prototype.maxThis = function (that) {
    this.x = Math.max(this.x, that.x);
    this.y = Math.max(this.y, that.y);
};

Point2.prototype.transpose = function () {
    return this.clone().transposeThis();
};

Point2.prototype.transposeThis = function () {
    var temp = this.x;
    this.x = this.y;
    this.y = temp;
    return this;
};

Point2.prototype.clone = function () {
    return new Point2(this.x, this.y);
};

Point2.prototype.become = function (that) {
    this.x = that.x;
    this.y = that.y;
    return this;
};

Point2.prototype.hash = function () {
    return this.x + "," + this.y;
};

Point2.prototype.equals = function (that) {
    return this.x === that.x && this.y === that.y;
};

Point2.prototype.toString = function () {
    return 'Point2(' + this.x + ', ' + this.y + ')';
};


}],["lib/performance-now.js","performance-now/lib","performance-now.js",{},function (require, exports, module, __filename, __dirname){

// performance-now/lib/performance-now.js
// --------------------------------------

// Generated by CoffeeScript 1.6.3
(function() {
  var getNanoSeconds, hrtime, loadTime;

  if ((typeof performance !== "undefined" && performance !== null) && performance.now) {
    module.exports = function() {
      return performance.now();
    };
  } else if ((typeof process !== "undefined" && process !== null) && process.hrtime) {
    module.exports = function() {
      return (getNanoSeconds() - loadTime) / 1e6;
    };
    hrtime = process.hrtime;
    getNanoSeconds = function() {
      var hr;
      hr = hrtime();
      return hr[0] * 1e9 + hr[1];
    };
    loadTime = getNanoSeconds();
  } else if (Date.now) {
    module.exports = function() {
      return Date.now() - loadTime;
    };
    loadTime = Date.now();
  } else {
    module.exports = function() {
      return new Date().getTime() - loadTime;
    };
    loadTime = new Date().getTime();
  }

}).call(this);

/*
//@ sourceMappingURL=performance-now.map
*/

}],["index.js","pop-observe","index.js",{"./observable-array":48,"./observable-object":50,"./observable-range":51,"./observable-map":49},function (require, exports, module, __filename, __dirname){

// pop-observe/index.js
// --------------------

"use strict";

require("./observable-array");
var Oa = require("./observable-array");
var Oo = require("./observable-object");
var Or = require("./observable-range");
var Om = require("./observable-map");

exports.makeArrayObservable = Oa.makeArrayObservable;

for (var name in Oo) {
    exports[name] = Oo[name];
}
for (var name in Or) {
    exports[name] = Or[name];
}
for (var name in Om) {
    exports[name] = Om[name];
}


}],["observable-array.js","pop-observe","observable-array.js",{"./observable-object":50,"./observable-range":51,"./observable-map":49,"pop-swap/swap":53},function (require, exports, module, __filename, __dirname){

// pop-observe/observable-array.js
// -------------------------------

/*
 * Based in part on observable arrays from Motorola Mobility’s Montage
 * Copyright (c) 2012, Motorola Mobility LLC. All Rights Reserved.
 *
 * 3-Clause BSD License
 * https://github.com/motorola-mobility/montage/blob/master/LICENSE.md
 */

/**
 * This module is responsible for observing changes to owned properties of
 * objects and changes to the content of arrays caused by method calls. The
 * interface for observing array content changes establishes the methods
 * necessary for any collection with observable content.
 */

var Oo = require("./observable-object");
var Or = require("./observable-range");
var Om = require("./observable-map");

var array_swap = require("pop-swap/swap");
var array_splice = Array.prototype.splice;
var array_slice = Array.prototype.slice;
var array_reverse = Array.prototype.reverse;
var array_sort = Array.prototype.sort;
var array_empty = [];

var observableArrayProperties = {

    swap: {
        value: function swap(start, minusLength, plus) {
            if (plus) {
                if (!Array.isArray(plus)) {
                    plus = array_slice.call(plus);
                }
            } else {
                plus = array_empty;
            }

            if (start < 0) {
                start = this.length + start;
            } else if (start > this.length) {
                var holes = start - this.length;
                var newPlus = Array(holes + plus.length);
                for (var i = 0, j = holes; i < plus.length; i++, j++) {
                    if (i in plus) {
                        newPlus[j] = plus[i];
                    }
                }
                plus = newPlus;
                start = this.length;
            }

            if (start + minusLength > this.length) {
                // Truncate minus length if it extends beyond the length
                minusLength = this.length - start;
            } else if (minusLength < 0) {
                // It is the JavaScript way.
                minusLength = 0;
            }

            var minus;
            if (minusLength === 0) {
                // minus will be empty
                if (plus.length === 0) {
                    // at this point if plus is empty there is nothing to do.
                    return []; // [], but spare us an instantiation
                }
                minus = array_empty;
            } else {
                minus = array_slice.call(this, start, start + minusLength);
            }

            var diff = plus.length - minus.length;
            var oldLength = this.length;
            var newLength = Math.max(this.length + diff, start + plus.length);
            var longest = Math.max(oldLength, newLength);
            var observedLength = Math.min(longest, this.observedLength);

            // dispatch before change events
            if (diff) {
                Oo.dispatchPropertyWillChange(this, "length", newLength, oldLength);
            }
            Or.dispatchRangeWillChange(this, plus, minus, start);
            if (diff === 0) {
                // Substring replacement
                for (var i = start, j = 0; i < start + plus.length; i++, j++) {
                    if (plus[j] !== minus[j]) {
                        Oo.dispatchPropertyWillChange(this, i, plus[j], minus[j]);
                        Om.dispatchMapWillChange(this, "update", i, plus[j], minus[j]);
                    }
                }
            } else {
                // All subsequent values changed or shifted.
                // Avoid (observedLength - start) long walks if there are no
                // registered descriptors.
                for (var i = start, j = 0; i < observedLength; i++, j++) {
                    if (i < oldLength && i < newLength) { // update
                        if (j < plus.length) {
                            if (plus[j] !== this[i]) {
                                Oo.dispatchPropertyWillChange(this, i, plus[j], this[i]);
                                Om.dispatchMapWillChange(this, "update", i, plus[j], this[i]);
                            }
                        } else {
                            if (this[i - diff] !== this[i]) {
                                Oo.dispatchPropertyWillChange(this, i, this[i - diff], this[i]);
                                Om.dispatchMapWillChange(this, "update", i, this[i - diff], this[i]);
                            }
                        }
                    } else if (i < newLength) { // but i >= oldLength, create
                        if (j < plus.length) {
                            if (plus[j] !== void 0) {
                                Oo.dispatchPropertyWillChange(this, i, plus[j]);
                            }
                            Om.dispatchMapWillChange(this, "create", i, plus[j]);
                        } else {
                            if (this[i - diff] !== void 0) {
                                Oo.dispatchPropertyWillChange(this, i, this[i - diff]);
                            }
                            Om.dispatchMapWillChange(this, "create", i, this[i - diff]);
                        }
                    } else if (i < oldLength) { // but i >= newLength, delete
                        if (this[i] !== void 0) {
                            Oo.dispatchPropertyWillChange(this, i, void 0, this[i]);
                        }
                        Om.dispatchMapWillChange(this, "delete", i, void 0, this[i]);
                    } else {
                        throw new Error("assertion error");
                    }
                }
            }

            // actual work
            array_swap(this, start, minusLength, plus);

            // dispatch after change events
            if (diff === 0) { // substring replacement
                for (var i = start, j = 0; i < start + plus.length; i++, j++) {
                    if (plus[j] !== minus[j]) {
                        Oo.dispatchPropertyChange(this, i, plus[j], minus[j]);
                        Om.dispatchMapChange(this, "update", i, plus[j], minus[j]);
                    }
                }
            } else {
                // All subsequent values changed or shifted.
                // Avoid (observedLength - start) long walks if there are no
                // registered descriptors.
                for (var i = start, j = 0; i < observedLength; i++, j++) {
                    if (i < oldLength && i < newLength) { // update
                        if (j < minus.length) {
                            if (this[i] !== minus[j]) {
                                Oo.dispatchPropertyChange(this, i, this[i], minus[j]);
                                Om.dispatchMapChange(this, "update", i, this[i], minus[j]);
                            }
                        } else {
                            if (this[i] !== this[i + diff]) {
                                Oo.dispatchPropertyChange(this, i, this[i], this[i + diff]);
                                Om.dispatchMapChange(this, "update", i, this[i], this[i + diff]);
                            }
                        }
                    } else if (i < newLength) { // but i >= oldLength, create
                        if (j < minus.length) {
                            if (this[i] !== minus[j]) {
                                Oo.dispatchPropertyChange(this, i, this[i], minus[j]);
                            }
                            Om.dispatchMapChange(this, "create", i, this[i], minus[j]);
                        } else {
                            if (this[i] !== this[i + diff]) {
                                Oo.dispatchPropertyChange(this, i, this[i], this[i + diff]);
                            }
                            Om.dispatchMapChange(this, "create", i, this[i], this[i + diff]);
                        }
                    } else if (i < oldLength) { // but i >= newLength, delete
                        if (j < minus.length) {
                            if (minus[j] !== void 0) {
                                Oo.dispatchPropertyChange(this, i, void 0, minus[j]);
                            }
                            Om.dispatchMapChange(this, "delete", i, void 0, minus[j]);
                        } else {
                            if (this[i + diff] !== void 0) {
                                Oo.dispatchPropertyChange(this, i, void 0, this[i + diff]);
                            }
                            Om.dispatchMapChange(this, "delete", i, void 0, this[i + diff]);
                        }
                    } else {
                        throw new Error("assertion error");
                    }
                }
            }

            Or.dispatchRangeChange(this, plus, minus, start);
            if (diff) {
                Oo.dispatchPropertyChange(this, "length", newLength, oldLength);
            }
        },
        writable: true,
        configurable: true
    },

    splice: {
        value: function splice(start, minusLength) {
            if (start > this.length) {
                start = this.length;
            }
            var result = this.slice(start, start + minusLength);
            this.swap.call(this, start, minusLength, array_slice.call(arguments, 2));
            return result;
        },
        writable: true,
        configurable: true
    },

    // splice is the array content change utility belt.  forward all other
    // content changes to splice so we only have to write observer code in one
    // place

    reverse: {
        value: function reverse() {
            var reversed = this.slice();
            reversed.reverse();
            this.swap(0, this.length, reversed);
            return this;
        },
        writable: true,
        configurable: true
    },

    sort: {
        value: function sort() {
            var sorted = this.slice();
            array_sort.apply(sorted, arguments);
            this.swap(0, this.length, sorted);
            return this;
        },
        writable: true,
        configurable: true
    },

    set: {
        value: function set(index, value) {
            this.swap(index, index >= this.length ? 0 : 1, [value]);
            return true;
        },
        writable: true,
        configurable: true
    },

    shift: {
        value: function shift() {
            if (this.length) {
                var result = this[0];
                this.swap(0, 1);
                return result;
            }
        },
        writable: true,
        configurable: true
    },

    pop: {
        value: function pop() {
            if (this.length) {
                var result = this[this.length - 1];
                this.swap(this.length - 1, 1);
                return result;
            }
        },
        writable: true,
        configurable: true
    },

    push: {
        value: function push(value) {
            this.swap(this.length, 0, arguments);
            return this.length;
        },
        writable: true,
        configurable: true
    },

    unshift: {
        value: function unshift(value) {
            this.swap(0, 0, arguments);
            return this.length;
        },
        writable: true,
        configurable: true
    },

    clear: {
        value: function clear() {
            this.swap(0, this.length);
        },
        writable: true,
        configurable: true
    }

};

var hiddenProperty = {
    value: null,
    enumerable: false,
    writable: true,
    configurable: true
};

var observableArrayOwnProperties = {
    observed: hiddenProperty,
    observedLength: hiddenProperty,

    propertyObservers: hiddenProperty,
    wrappedPropertyDescriptors: hiddenProperty,

    rangeChangeObservers: hiddenProperty,
    rangeWillChangeObservers: hiddenProperty,
    dispatchesRangeChanges: hiddenProperty,

    mapChangeObservers: hiddenProperty,
    mapWillChangeObservers: hiddenProperty,
    dispatchesMapChanges: hiddenProperty
};

// use different strategies for making arrays observable between Internet
// Explorer and other browsers.
var protoIsSupported = {}.__proto__ === Object.prototype;
var bestowObservableArrayProperties;
if (protoIsSupported) {
    var observableArrayPrototype = Object.create(Array.prototype, observableArrayProperties);
    bestowObservableArrayProperties = function (array) {
        array.__proto__ = observableArrayPrototype;
    };
} else {
    bestowObservableArrayProperties = function (array) {
        Object.defineProperties(array, observableArrayProperties);
    };
}

exports.makeArrayObservable = makeArrayObservable;
function makeArrayObservable(array) {
    if (array.observed) {
        return;
    }
    bestowObservableArrayProperties(array);
    Object.defineProperties(array, observableArrayOwnProperties);
    array.observedLength = 0;
    array.observed = true;
}

// For ObservableObject
exports.makePropertyObservable = makePropertyObservable;
function makePropertyObservable(array, index) {
    makeArrayObservable(array);
    if (~~index === index && index >= 0) { // Note: NaN !== NaN, ~~"foo" !== "foo"
        makeIndexObservable(array, index);
    }
}

// For ObservableRange
exports.makeRangeChangesObservable = makeRangeChangesObservable;
function makeRangeChangesObservable(array) {
    makeArrayObservable(array);
}

// For ObservableMap
exports.makeMapChangesObservable = makeMapChangesObservable;
function makeMapChangesObservable(array) {
    makeArrayObservable(array);
    makeIndexObservable(array, Infinity);
}

function makeIndexObservable(array, index) {
    if (index >= array.observedLength) {
        array.observedLength = index + 1;
    }
}


}],["observable-map.js","pop-observe","observable-map.js",{"./observable-array":48},function (require, exports, module, __filename, __dirname){

// pop-observe/observable-map.js
// -----------------------------

"use strict";

var observerFreeList = [];
var observerToFreeList = [];
var dispatching = false;

module.exports = ObservableMap;
function ObservableMap() {
    throw new Error("Can't construct. ObservableMap is a mixin.");
}

ObservableMap.prototype.observeMapChange = function (handler, name, note, capture) {
    return observeMapChange(this, handler, name, note, capture);
};

ObservableMap.prototype.observeMapWillChange = function (handler, name, note) {
    return observeMapChange(this, handler, name, note, true);
};

ObservableMap.prototype.dispatchMapChange = function (type, key, plus, minus, capture) {
    return dispatchMapChange(this, type, key, plus, minus, capture);
};

ObservableMap.prototype.dispatchMapWillChange = function (type, key, plus, minus) {
    return dispatchMapWillChange(this, type, key, plus, minus, true);
};

ObservableMap.prototype.getMapChangeObservers = function (capture) {
    return getMapChangeObservers(this, capture);
};

ObservableMap.prototype.getMapWillChangeObservers = function () {
    return getMapChangeObservers(this, true);
};

ObservableMap.observeMapChange = observeMapChange;
function observeMapChange(object, handler, name, note, capture) {
    makeMapChangesObservable(object);
    var observers = getMapChangeObservers(object, capture);

    var observer;
    if (observerFreeList.length) { // TODO !debug?
        observer = observerFreeList.pop();
    } else {
        observer = new MapChangeObserver();
    }

    observer.object = object;
    observer.name = name;
    observer.capture = capture;
    observer.observers = observers;
    observer.handler = handler;
    observer.note = note;

    // Precompute dispatch method name

    var stringName = "" + name; // Array indicides must be coerced to string.
    var propertyName = stringName.slice(0, 1).toUpperCase() + stringName.slice(1);

    if (!capture) {
        var methodName = "handle" + propertyName + "MapChange";
        if (handler[methodName]) {
            observer.handlerMethodName = methodName;
        } else if (handler.handleMapChange) {
            observer.handlerMethodName = "handleMapChange";
        } else if (handler.call) {
            observer.handlerMethodName = null;
        } else {
            throw new Error("Can't arrange to dispatch map changes to " + handler);
        }
    } else {
        var methodName = "handle" + propertyName + "MapWillChange";
        if (handler[methodName]) {
            observer.handlerMethodName = methodName;
        } else if (handler.handleMapWillChange) {
            observer.handlerMethodName = "handleMapWillChange";
        } else if (handler.call) {
            observer.handlerMethodName = null;
        } else {
            throw new Error("Can't arrange to dispatch map changes to " + handler);
        }
    }

    observers.push(observer);

    // TODO issue warning if the number of handler records is worrisome
    return observer;
}

ObservableMap.observeMapWillChange = observeMapWillChange;
function observeMapWillChange(object, handler, name, note) {
    return observeMapChange(object, handler, name, note, true);
}

ObservableMap.dispatchMapChange = dispatchMapChange;
function dispatchMapChange(object, type, key, plus, minus, capture) {
    if (plus === minus) {
        return;
    }
    if (!dispatching) { // TODO && !debug?
        return startMapChangeDispatchContext(object, type, key, plus, minus, capture);
    }
    var observers = getMapChangeObservers(object, capture);
    for (var index = 0; index < observers.length; index++) {
        var observer = observers[index];
        observer.dispatch(type, key, plus, minus);
    }
}

ObservableMap.dispatchMapWillChange = dispatchMapWillChange;
function dispatchMapWillChange(object, type, key, plus, minus) {
    return dispatchMapChange(object, type, key, plus, minus, true);
}

function startMapChangeDispatchContext(object, type, key, plus, minus, capture) {
    dispatching = true;
    try {
        dispatchMapChange(object, type, key, plus, minus, capture);
    } catch (error) {
        if (typeof error === "object" && typeof error.message === "string") {
            error.message = "Map change dispatch possibly corrupted by error: " + error.message;
            throw error;
        } else {
            throw new Error("Map change dispatch possibly corrupted by error: " + error);
        }
    } finally {
        dispatching = false;
        if (observerToFreeList.length) {
            // Using push.apply instead of addEach because push will definitely
            // be much faster than the generic addEach, which also handles
            // non-array collections.
            observerFreeList.push.apply(
                observerFreeList,
                observerToFreeList
            );
            // Using clear because it is observable. The handler record array
            // is obtainable by getPropertyChangeObservers, and is observable.
            observerToFreeList.clear();
        }
    }
}

function getMapChangeObservers(object, capture) {
    if (capture) {
        if (!object.mapWillChangeObservers) {
            object.mapWillChangeObservers = [];
        }
        return object.mapWillChangeObservers;
    } else {
        if (!object.mapChangeObservers) {
            object.mapChangeObservers = [];
        }
        return object.mapChangeObservers;
    }
}

function getMapWillChangeObservers(object) {
    return getMapChangeObservers(object, true);
}

function makeMapChangesObservable(object) {
    if (Array.isArray(object)) {
        Oa.makeMapChangesObservable(object);
    }
    if (object.makeMapChangesObservable) {
        object.makeMapChangesObservable();
    }
    object.dispatchesMapChanges = true;
}

function MapChangeObserver() {
    this.init();
}

MapChangeObserver.prototype.init = function () {
    this.object = null;
    this.name = null;
    this.observers = null;
    this.handler = null;
    this.handlerMethodName = null;
    this.childObserver = null;
    this.note = null;
    this.capture = null;
};

MapChangeObserver.prototype.cancel = function () {
    var observers = this.observers;
    var index = observers.indexOf(this);
    // Unfortunately, if this observer was reused, this would not be sufficient
    // to detect a duplicate cancel. Do not cancel more than once.
    if (index < 0) {
        throw new Error(
            "Can't cancel observer for " +
            JSON.stringify(this.name) + " map changes" +
            " because it has already been canceled"
        );
    }
    var childObserver = this.childObserver;
    observers.splice(index, 1);
    this.init();
    // If this observer is canceled while dispatching a change
    // notification for the same property...
    // 1. We cannot put the handler record onto the free list because
    // it may have been captured in the array of records to which
    // the change notification would be sent. We must mark it as
    // canceled by nulling out the handler property so the dispatcher
    // passes over it.
    // 2. We also cannot put the handler record onto the free list
    // until all change dispatches have been completed because it could
    // conceivably be reused, confusing the current dispatcher.
    if (dispatching) {
        // All handlers added to this list will be moved over to the
        // actual free list when there are no longer any property
        // change dispatchers on the stack.
        observerToFreeList.push(this);
    } else {
        observerFreeList.push(this);
    }
    if (childObserver) {
        // Calling user code on our stack.
        // Done in tail position to avoid a plan interference hazard.
        childObserver.cancel();
    }
};

MapChangeObserver.prototype.dispatch = function (type, key, plus, minus) {
    var handler = this.handler;
    // A null handler implies that an observer was canceled during the dispatch
    // of a change. The observer is pending addition to the free list.
    if (!handler) {
        return;
    }

    var childObserver = this.childObserver;
    this.childObserver = null;
    // XXX plan interference hazards calling cancel and handler methods:
    if (childObserver) {
        childObserver.cancel();
    }

    var handlerMethodName = this.handlerMethodName;
    if (handlerMethodName && typeof handler[handlerMethodName] === "function") {
        childObserver = handler[handlerMethodName](plus, minus, key, type, this.object);
    } else if (handler.call) {
        childObserver = handler.call(void 0, plus, minus, key, type, this.object);
    } else {
        throw new Error(
            "Can't dispatch map change for " + JSON.stringify(this.name) + " to " + handler +
            " because there is no handler method"
        );
    }

    this.childObserver = childObserver;
    return this;
};

var Oa = require("./observable-array");

}],["observable-object.js","pop-observe","observable-object.js",{"./observable-array":48},function (require, exports, module, __filename, __dirname){

// pop-observe/observable-object.js
// --------------------------------

/*jshint node: true*/
"use strict";

// XXX Note: exceptions thrown from handlers and handler cancelers may
// interfere with dispatching to subsequent handlers of any change in progress.
// It is unlikely that plans are recoverable once an exception interferes with
// change dispatch. The internal records should not be corrupt, but observers
// might miss an intermediate property change.

var owns = Object.prototype.hasOwnProperty;

var observerFreeList = [];
var observerToFreeList = [];
var dispatching = false;

// Reusable property descriptor
var hiddenValueProperty = {
    value: null,
    writable: true,
    enumerable: false,
    configurable: true
};

module.exports = ObservableObject;
function ObservableObject() {
    throw new Error("Can't construct. ObservableObject is a mixin.");
}

ObservableObject.prototype.observePropertyChange = function (name, handler, note, capture) {
    return observePropertyChange(this, name, handler, note, capture);
};

ObservableObject.prototype.observePropertyWillChange = function (name, handler, note) {
    return observePropertyWillChange(this, name, handler, note);
};

ObservableObject.prototype.dispatchPropertyChange = function (name, plus, minus, capture) {
    return dispatchPropertyChange(this, name, plus, minus, capture);
};

ObservableObject.prototype.dispatchPropertyWillChange = function (name, plus, minus) {
    return dispatchPropertyWillChange(this, name, plus, minus);
};

ObservableObject.prototype.getPropertyChangeObservers = function (name, capture) {
    return getPropertyChangeObservers(this, name, capture);
};

ObservableObject.prototype.getPropertyWillChangeObservers = function (name) {
    return getPropertyWillChangeObservers(this, name);
};

ObservableObject.prototype.makePropertyObservable = function (name) {
    return makePropertyObservable(this, name);
};

ObservableObject.prototype.preventPropertyObserver = function (name) {
    return preventPropertyObserver(this, name);
};

ObservableObject.prototype.PropertyChangeObserver = PropertyChangeObserver;

// Constructor interface with polymorphic delegation if available

ObservableObject.observePropertyChange = function (object, name, handler, note, capture) {
    if (object.observePropertyChange) {
        return object.observePropertyChange(name, handler, note, capture);
    } else {
        return observePropertyChange(object, name, handler, note, capture);
    }
};

ObservableObject.observePropertyWillChange = function (object, name, handler, note) {
    if (object.observePropertyWillChange) {
        return object.observePropertyWillChange(name, handler, note);
    } else {
        return observePropertyWillChange(object, name, handler, note);
    }
};

ObservableObject.dispatchPropertyChange = function (object, name, plus, minus, capture) {
    if (object.dispatchPropertyChange) {
        return object.dispatchPropertyChange(name, plus, minus, capture);
    } else {
        return dispatchPropertyChange(object, name, plus, minus, capture);
    }
};

ObservableObject.dispatchPropertyWillChange = function (object, name, plus, minus) {
    if (object.dispatchPropertyWillChange) {
        return object.dispatchPropertyWillChange(name, plus, minus);
    } else {
        return dispatchPropertyWillChange(object, name, plus, minus);
    }
};

ObservableObject.makePropertyObservable = function (object, name) {
    if (object.makePropertyObservable) {
        return object.makePropertyObservable(name);
    } else {
        return makePropertyObservable(object, name);
    }
};

ObservableObject.preventPropertyObserver = function (object, name) {
    if (object.preventPropertyObserver) {
        return object.preventPropertyObserver(name);
    } else {
        return preventPropertyObserver(object, name);
    }
};

// Implementation

function observePropertyChange(object, name, handler, note, capture) {
    ObservableObject.makePropertyObservable(object, name);
    var observers = getPropertyChangeObservers(object, name, capture);

    var observer;
    if (observerFreeList.length) { // TODO && !debug?
        observer = observerFreeList.pop();
    } else {
        observer = new PropertyChangeObserver();
    }

    observer.object = object;
    observer.propertyName = name;
    observer.capture = capture;
    observer.observers = observers;
    observer.handler = handler;
    observer.note = note;
    observer.value = object[name];

    // Precompute dispatch method names.

    var stringName = "" + name; // Array indicides must be coerced to string.
    var propertyName = stringName.slice(0, 1).toUpperCase() + stringName.slice(1);

    if (!capture) {
        var specificChangeMethodName = "handle" + propertyName + "PropertyChange";
        var genericChangeMethodName = "handlePropertyChange";
        if (handler[specificChangeMethodName]) {
            observer.handlerMethodName = specificChangeMethodName;
        } else if (handler[genericChangeMethodName]) {
            observer.handlerMethodName = genericChangeMethodName;
        } else if (handler.call) {
            observer.handlerMethodName = null;
        } else {
            throw new Error("Can't arrange to dispatch " + JSON.stringify(name) + " property changes on " + object);
        }
    } else {
        var specificWillChangeMethodName = "handle" + propertyName + "PropertyWillChange";
        var genericWillChangeMethodName = "handlePropertyWillChange";
        if (handler[specificWillChangeMethodName]) {
            observer.handlerMethodName = specificWillChangeMethodName;
        } else if (handler[genericWillChangeMethodName]) {
            observer.handlerMethodName = genericWillChangeMethodName;
        } else if (handler.call) {
            observer.handlerMethodName = null;
        } else {
            throw new Error("Can't arrange to dispatch " + JSON.stringify(name) + " property changes on " + object);
        }
    }

    observers.push(observer);

    // TODO issue warnings if the number of handler records exceeds some
    // concerning quantity as a harbinger of a memory leak.
    // TODO Note that if this is garbage collected without ever being called,
    // it probably indicates a programming error.
    return observer;
}

function observePropertyWillChange(object, name, handler, note) {
    return observePropertyChange(object, name, handler, note, true);
}

function dispatchPropertyChange(object, name, plus, minus, capture) {
    if (!dispatching) { // TODO && !debug?
        return startPropertyChangeDispatchContext(object, name, plus, minus, capture);
    }
    var observers = getPropertyChangeObservers(object, name, capture).slice();
    for (var index = 0; index < observers.length; index++) {
        var observer = observers[index];
        observer.dispatch(plus, minus);
    }
}

function dispatchPropertyWillChange(object, name, plus, minus) {
    dispatchPropertyChange(object, name, plus, minus, true);
}

function startPropertyChangeDispatchContext(object, name, plus, minus, capture) {
    dispatching = true;
    try {
        dispatchPropertyChange(object, name, plus, minus, capture);
    } catch (error) {
        if (typeof error === "object" && typeof error.message === "string") {
            error.message = "Property change dispatch possibly corrupted by error: " + error.message;
            throw error;
        } else {
            throw new Error("Property change dispatch possibly corrupted by error: " + error);
        }
    } finally {
        dispatching = false;
        if (observerToFreeList.length) {
            // Using push.apply instead of addEach because push will definitely
            // be much faster than the generic addEach, which also handles
            // non-array collections.
            observerFreeList.push.apply(
                observerFreeList,
                observerToFreeList
            );
            // Using clear because it is observable. The handler record array
            // is obtainable by getPropertyChangeObservers, and is observable.
            observerToFreeList.length = 0;
        }
    }
}

function getPropertyChangeObservers(object, name, capture) {
    if (!object.propertyObservers) {
        hiddenValueProperty.value = Object.create(null);
        Object.defineProperty(object, "propertyObservers", hiddenValueProperty);
    }
    var observersByKey = object.propertyObservers;
    var phase = capture ? "WillChange" : "Change";
    var key = name + phase;
    if (!Object.prototype.hasOwnProperty.call(observersByKey, key)) {
        observersByKey[key] = [];
    }
    return observersByKey[key];
}

function getPropertyWillChangeObservers(object, name) {
    return getPropertyChangeObservers(object, name, true);
}

function PropertyChangeObserver() {
    this.init();
    // Object.seal(this); // Maybe one day, this won't deoptimize.
}

PropertyChangeObserver.prototype.init = function () {
    this.object = null;
    this.propertyName = null;
    // Peer observers, from which to pluck itself upon cancelation.
    this.observers = null;
    // On which to dispatch property change notifications.
    this.handler = null;
    // Precomputed handler method name for change dispatch
    this.handlerMethodName = null;
    // Returned by the last property change notification, which must be
    // canceled before the next change notification, or when this observer is
    // finally canceled.
    this.childObserver = null;
    // For the discretionary use of the user, perhaps to track why this
    // observer has been created, or whether this observer should be
    // serialized.
    this.note = null;
    // Whether this observer dispatches before a change occurs, or after
    this.capture = null;
    // The last known value
    this.value = null;
};

PropertyChangeObserver.prototype.cancel = function () {
    var observers = this.observers;
    var index = observers.indexOf(this);
    // Unfortunately, if this observer was reused, this would not be sufficient
    // to detect a duplicate cancel. Do not cancel more than once.
    if (index < 0) {
        throw new Error(
            "Can't cancel observer for " +
            JSON.stringify(this.propertyName) + " on " + this.object +
            " because it has already been canceled"
        );
    }
    var childObserver = this.childObserver;
    observers.splice(index, 1);
    this.init();
    // If this observer is canceled while dispatching a change
    // notification for the same property...
    // 1. We cannot put the handler record onto the free list because
    // it may have been captured in the array of records to which
    // the change notification would be sent. We must mark it as
    // canceled by nulling out the handler property so the dispatcher
    // passes over it.
    // 2. We also cannot put the handler record onto the free list
    // until all change dispatches have been completed because it could
    // conceivably be reused, confusing the current dispatcher.
    if (dispatching) {
        // All handlers added to this list will be moved over to the
        // actual free list when there are no longer any property
        // change dispatchers on the stack.
        observerToFreeList.push(this);
    } else {
        observerFreeList.push(this);
    }
    if (childObserver) {
        // Calling user code on our stack.
        // Done in tail position to avoid a plan interference hazard.
        childObserver.cancel();
    }
};

PropertyChangeObserver.prototype.dispatch = function (plus, minus) {
    var handler = this.handler;
    // A null handler implies that an observer was canceled during the dispatch
    // of a change. The observer is pending addition to the free list.
    if (!handler) {
        return;
    }

    if (minus === void 0) {
        minus = this.value;
    }
    this.value = plus;

    var childObserver = this.childObserver;
    this.childObserver = null;
    // XXX plan interference hazards calling cancel and handler methods:
    if (childObserver) {
        childObserver.cancel();
    }
    var handlerMethodName = this.handlerMethodName;
    if (handlerMethodName && typeof handler[handlerMethodName] === "function") {
        childObserver = handler[handlerMethodName](plus, minus, this.propertyName, this.object);
    } else if (handler.call) {
        childObserver = handler.call(void 0, plus, minus, this.propertyName, this.object);
    } else {
        throw new Error(
            "Can't dispatch " + JSON.stringify(handlerMethodName) + " property change on " + object +
            " because there is no handler method"
        );
    }

    this.childObserver = childObserver;
    return this;
};

function makePropertyObservable(object, name) {
    if (Array.isArray(object)) {
        return Oa.makePropertyObservable(object, name);
    }

    var wrappedDescriptor = wrapPropertyDescriptor(object, name);

    if (!wrappedDescriptor) {
        return;
    }

    var thunk;
    // in both of these new descriptor variants, we reuse the wrapped
    // descriptor to either store the current value or apply getters
    // and setters. this is handy since we can reuse the wrapped
    // descriptor if we uninstall the observer. We even preserve the
    // assignment semantics, where we get the value from up the
    // prototype chain, and set as an owned property.
    if ("value" in wrappedDescriptor) {
        thunk = makeValuePropertyThunk(name, wrappedDescriptor);
    } else { // "get" or "set", but not necessarily both
        thunk = makeGetSetPropertyThunk(name, wrappedDescriptor);
    }

    Object.defineProperty(object, name, thunk);
}

/**
 * Prevents a thunk from being installed on a property, assuming that the
 * underlying type will dispatch the change manually, or intends the property
 * to stick on all instances.
 */
function preventPropertyObserver(object, name) {
    var wrappedDescriptor = wrapPropertyDescriptor(object, name);
    Object.defineProperty(object, name, wrappedDescriptor);
}

function wrapPropertyDescriptor(object, name) {
    // Arrays are special. We do not support direct setting of properties
    // on an array. instead, call .set(index, value). This is observable.
    // "length" property is observable for all mutating methods because
    // our overrides explicitly dispatch that change.
    if (Array.isArray(object)) {
        return;
    }

    if (!Object.isExtensible(object, name)) {
        return;
    }

    var wrappedDescriptor = getPropertyDescriptor(object, name);
    var wrappedPrototype = wrappedDescriptor.prototype;

    var existingWrappedDescriptors = wrappedPrototype.wrappedPropertyDescriptors;
    if (existingWrappedDescriptors && owns.call(existingWrappedDescriptors, name)) {
        return;
    }

    var wrappedPropertyDescriptors = object.wrappedPropertyDescriptors;
    if (!wrappedPropertyDescriptors) {
        wrappedPropertyDescriptors = {};
        hiddenValueProperty.value = wrappedPropertyDescriptors;
        Object.defineProperty(object, "wrappedPropertyDescriptors", hiddenValueProperty);
    }

    if (owns.call(wrappedPropertyDescriptors, name)) {
        // If we have already recorded a wrapped property descriptor,
        // we have already installed the observer, so short-here.
        return;
    }

    if (!wrappedDescriptor.configurable) {
        return;
    }

    // Memoize the descriptor so we know not to install another layer. We
    // could use it to uninstall the observer, but we do not to avoid GC
    // thrashing.
    wrappedPropertyDescriptors[name] = wrappedDescriptor;

    // Give up *after* storing the wrapped property descriptor so it
    // can be restored by uninstall. Unwritable properties are
    // silently not overriden. Since success is indistinguishable from
    // failure, we let it pass but don't waste time on intercepting
    // get/set.
    if (!wrappedDescriptor.writable && !wrappedDescriptor.set) {
        return;
    }

    // If there is no setter, it is not mutable, and observing is moot.
    // Manual dispatch may still apply.
    if (wrappedDescriptor.get && !wrappedDescriptor.set) {
        return;
    }

    return wrappedDescriptor;
}

function getPropertyDescriptor(object, name) {
    // walk up the prototype chain to find a property descriptor for the
    // property name.
    var descriptor;
    var prototype = object;
    do {
        descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        if (descriptor) {
            break;
        }
        prototype = Object.getPrototypeOf(prototype);
    } while (prototype);
    if (descriptor) {
        descriptor.prototype = prototype;
        return descriptor;
    } else {
        // or default to an undefined value
        return {
            prototype: object,
            value: undefined,
            enumerable: false,
            writable: true,
            configurable: true
        };
    }
}

function makeValuePropertyThunk(name, wrappedDescriptor) {
    return {
        get: function () {
            // Uses __this__ to quickly distinguish __state__ properties from
            // upward in the prototype chain.
            if (this.__state__ === void 0 || this.__state__.__this__ !== this) {
                initState(this);
            }
            var state = this.__state__;

            if (!(name in state)) {
                // Get the initial value from up the prototype chain
                state[name] = wrappedDescriptor.value;
            }

            return state[name];
        },
        set: function (plus) {
            // Uses __this__ to quickly distinguish __state__ properties from
            // upward in the prototype chain.
            if (this.__state__ === void 0 || this.__state__.__this__ !== this) {
                initState(this);
                this.__state__[name] = this[name];
            }
            var state = this.__state__;

            if (!(name in state)) {
                // Get the initial value from up the prototype chain
                state[name] = wrappedDescriptor.value;
            }

            if (plus === state[name]) {
                return plus;
            }

            // XXX plan interference hazard:
            dispatchPropertyWillChange(this, name, plus);

            wrappedDescriptor.value = plus;
            state[name] = plus;

            // XXX plan interference hazard:
            dispatchPropertyChange(this, name, plus);

            return plus;
        },
        enumerable: wrappedDescriptor.enumerable,
        configurable: true
    };
}

function makeGetSetPropertyThunk(name, wrappedDescriptor) {
    return {
        get: function () {
            if (wrappedDescriptor.get) {
                return wrappedDescriptor.get.apply(this, arguments);
            }
        },
        set: function (plus) {
            // Uses __this__ to quickly distinguish __state__ properties from
            // upward in the prototype chain.
            if (this.__state__ === void 0 || this.__state__.__this__ !== this) {
                initState(this);
                this.__state__[name] = this[name];
            }
            var state = this.__state__;

            if (state[name] === plus) {
                return plus;
            }

            // XXX plan interference hazard:
            dispatchPropertyWillChange(this, name, plus);

            // call through to actual setter
            if (wrappedDescriptor.set) {
                wrappedDescriptor.set.apply(this, arguments);
                state[name] = plus;
            }

            // use getter, if possible, to adjust the plus value if the setter
            // adjusted it, for example a setter for an array property that
            // retains the original array and replaces its content, or a setter
            // that coerces the value to an expected type.
            if (wrappedDescriptor.get) {
                plus = wrappedDescriptor.get.apply(this, arguments);
            }

            // dispatch the new value: the given value if there is
            // no getter, or the actual value if there is one
            // TODO spec
            // XXX plan interference hazard:
            dispatchPropertyChange(this, name, plus);

            return plus;
        },
        enumerable: wrappedDescriptor.enumerable,
        configurable: true
    };
}

function initState(object) {
    Object.defineProperty(object, "__state__", {
        value: {
            __this__: object
        },
        writable: true,
        enumerable: false,
        configurable: true
    });
}

var Oa = require("./observable-array");

}],["observable-range.js","pop-observe","observable-range.js",{"./observable-array":48},function (require, exports, module, __filename, __dirname){

// pop-observe/observable-range.js
// -------------------------------

/*global -WeakMap*/
"use strict";

// TODO review all error messages for consistency and helpfulness across observables

var observerFreeList = [];
var observerToFreeList = [];
var dispatching = false;

module.exports = ObservableRange;
function ObservableRange() {
    throw new Error("Can't construct. ObservableRange is a mixin.");
}

ObservableRange.prototype.observeRangeChange = function (handler, name, note, capture) {
    return observeRangeChange(this, handler, name, note, capture);
};

ObservableRange.prototype.observeRangeWillChange = function (handler, name, note) {
    return observeRangeChange(this, handler, name, note, true);
};

ObservableRange.prototype.dispatchRangeChange = function (plus, minus, index, capture) {
    return dispatchRangeChange(this, plus, minus, index, capture);
};

ObservableRange.prototype.dispatchRangeWillChange = function (plus, minus, index) {
    return dispatchRangeChange(this, plus, minus, index, true);
};

ObservableRange.prototype.getRangeChangeObservers = function (capture) {
};

ObservableRange.prototype.getRangeWillChangeObservers = function () {
    return getRangeChangeObservers(this, true);
};

ObservableRange.observeRangeChange = observeRangeChange;
function observeRangeChange(object, handler, name, note, capture) {
    makeRangeChangesObservable(object);
    var observers = getRangeChangeObservers(object, capture);

    var observer;
    if (observerFreeList.length) { // TODO !debug?
        observer = observerFreeList.pop();
    } else {
        observer = new RangeChangeObserver();
    }

    observer.object = object;
    observer.name = name;
    observer.capture = capture;
    observer.observers = observers;
    observer.handler = handler;
    observer.note = note;

    // Precompute dispatch method name

    var stringName = "" + name; // Array indicides must be coerced to string.
    var propertyName = stringName.slice(0, 1).toUpperCase() + stringName.slice(1);

    if (!capture) {
        var methodName = "handle" + propertyName + "RangeChange";
        if (handler[methodName]) {
            observer.handlerMethodName = methodName;
        } else if (handler.handleRangeChange) {
            observer.handlerMethodName = "handleRangeChange";
        } else if (handler.call) {
            observer.handlerMethodName = null;
        } else {
            throw new Error("Can't arrange to dispatch " + JSON.stringify(name) + " map changes");
        }
    } else {
        var methodName = "handle" + propertyName + "RangeWillChange";
        if (handler[methodName]) {
            observer.handlerMethodName = methodName;
        } else if (handler.handleRangeWillChange) {
            observer.handlerMethodName = "handleRangeWillChange";
        } else if (handler.call) {
            observer.handlerMethodName = null;
        } else {
            throw new Error("Can't arrange to dispatch " + JSON.stringify(name) + " map changes");
        }
    }

    observers.push(observer);

    // TODO issue warning if the number of handler records is worrisome
    return observer;
}

ObservableRange.observeRangeWillChange = observeRangeWillChange;
function observeRangeWillChange(object, handler, name, note) {
    return observeRangeChange(object, handler, name, note, true);
}

ObservableRange.dispatchRangeChange = dispatchRangeChange;
function dispatchRangeChange(object, plus, minus, index, capture) {
    if (!dispatching) { // TODO && !debug?
        return startRangeChangeDispatchContext(object, plus, minus, index, capture);
    }
    var observers = getRangeChangeObservers(object, capture);
    for (var observerIndex = 0; observerIndex < observers.length; observerIndex++) {
        var observer = observers[observerIndex];
        // The slicing ensures that handlers cannot interfere with another by
        // altering these arguments.
        observer.dispatch(plus.slice(), minus.slice(), index);
    }
}

ObservableRange.dispatchRangeWillChange = dispatchRangeWillChange;
function dispatchRangeWillChange(object, plus, minus, index) {
    return dispatchRangeChange(object, plus, minus, index, true);
}

function startRangeChangeDispatchContext(object, plus, minus, index, capture) {
    dispatching = true;
    try {
        dispatchRangeChange(object, plus, minus, index, capture);
    } catch (error) {
        if (typeof error === "object" && typeof error.message === "string") {
            error.message = "Range change dispatch possibly corrupted by error: " + error.message;
            throw error;
        } else {
            throw new Error("Range change dispatch possibly corrupted by error: " + error);
        }
    } finally {
        dispatching = false;
        if (observerToFreeList.length) {
            // Using push.apply instead of addEach because push will definitely
            // be much faster than the generic addEach, which also handles
            // non-array collections.
            observerFreeList.push.apply(
                observerFreeList,
                observerToFreeList
            );
            // Using clear because it is observable. The handler record array
            // is obtainable by getPropertyChangeObservers, and is observable.
            if (observerToFreeList.clear) {
                observerToFreeList.clear();
            } else {
                observerToFreeList.length = 0;
            }
        }
    }
}

function makeRangeChangesObservable(object) {
    if (Array.isArray(object)) {
        Oa.makeRangeChangesObservable(object);
    }
    if (object.makeRangeChangesObservable) {
        object.makeRangeChangesObservable();
    }
    object.dispatchesRangeChanges = true;
}

function getRangeChangeObservers(object, capture) {
    if (capture) {
        if (!object.rangeWillChangeObservers) {
            object.rangeWillChangeObservers = [];
        }
        return object.rangeWillChangeObservers;
    } else {
        if (!object.rangeChangeObservers) {
            object.rangeChangeObservers = [];
        }
        return object.rangeChangeObservers;
    }
}

/*
    if (object.preventPropertyObserver) {
        return object.preventPropertyObserver(name);
    } else {
        return preventPropertyObserver(object, name);
    }
*/

function RangeChangeObserver() {
    this.init();
}

RangeChangeObserver.prototype.init = function () {
    this.object = null;
    this.name = null;
    this.observers = null;
    this.handler = null;
    this.handlerMethodName = null;
    this.childObserver = null;
    this.note = null;
    this.capture = null;
};

RangeChangeObserver.prototype.cancel = function () {
    var observers = this.observers;
    var index = observers.indexOf(this);
    // Unfortunately, if this observer was reused, this would not be sufficient
    // to detect a duplicate cancel. Do not cancel more than once.
    if (index < 0) {
        throw new Error(
            "Can't cancel observer for " +
            JSON.stringify(this.name) + " range changes" +
            " because it has already been canceled"
        );
    }
    var childObserver = this.childObserver;
    observers.splice(index, 1);
    this.init();
    // If this observer is canceled while dispatching a change
    // notification for the same property...
    // 1. We cannot put the handler record onto the free list because
    // it may have been captured in the array of records to which
    // the change notification would be sent. We must mark it as
    // canceled by nulling out the handler property so the dispatcher
    // passes over it.
    // 2. We also cannot put the handler record onto the free list
    // until all change dispatches have been completed because it could
    // conceivably be reused, confusing the current dispatcher.
    if (dispatching) {
        // All handlers added to this list will be moved over to the
        // actual free list when there are no longer any property
        // change dispatchers on the stack.
        observerToFreeList.push(this);
    } else {
        observerFreeList.push(this);
    }
    if (childObserver) {
        // Calling user code on our stack.
        // Done in tail position to avoid a plan interference hazard.
        childObserver.cancel();
    }
};

RangeChangeObserver.prototype.dispatch = function (plus, minus, index) {
    var handler = this.handler;
    // A null handler implies that an observer was canceled during the dispatch
    // of a change. The observer is pending addition to the free list.
    if (!handler) {
        return;
    }

    var childObserver = this.childObserver;
    this.childObserver = null;
    // XXX plan interference hazards calling cancel and handler methods:
    if (childObserver) {
        childObserver.cancel();
    }

    var handlerMethodName = this.handlerMethodName;
    if (handlerMethodName && typeof handler[handlerMethodName] === "function") {
        childObserver = handler[handlerMethodName](plus, minus, index, this.object);
    } else if (handler.call) {
        childObserver = handler.call(void 0, plus, minus, index, this.object);
    } else {
        throw new Error(
            "Can't dispatch range change to " + handler
        );
    }

    this.childObserver = childObserver;

    return this;
};

var Oa = require("./observable-array");

}],["pop-swap.js","pop-swap","pop-swap.js",{"./swap":53},function (require, exports, module, __filename, __dirname){

// pop-swap/pop-swap.js
// --------------------

"use strict";

var swap = require("./swap");

module.exports = polymorphicSwap;
function polymorphicSwap(array, start, minusLength, plus) {
    if (typeof array.swap === "function") {
        array.swap(start, minusLength, plus);
    } else {
        swap(array, start, minusLength, plus);
    }
}


}],["swap.js","pop-swap","swap.js",{},function (require, exports, module, __filename, __dirname){

// pop-swap/swap.js
// ----------------

"use strict";

// Copyright (C) 2014 Montage Studio
// https://github.com/montagejs/collections/blob/7c674d49c04955f01bbd2839f90936e15aceea2f/operators/swap.js

var array_slice = Array.prototype.slice;

module.exports = swap;
function swap(array, start, minusLength, plus) {
    // Unrolled implementation into JavaScript for a couple reasons.
    // Calling splice can cause large stack sizes for large swaps. Also,
    // splice cannot handle array holes.
    if (plus) {
        if (!Array.isArray(plus)) {
            plus = array_slice.call(plus);
        }
    } else {
        plus = Array.empty;
    }

    if (start < 0) {
        start = array.length + start;
    } else if (start > array.length) {
        array.length = start;
    }

    if (start + minusLength > array.length) {
        // Truncate minus length if it extends beyond the length
        minusLength = array.length - start;
    } else if (minusLength < 0) {
        // It is the JavaScript way.
        minusLength = 0;
    }

    var diff = plus.length - minusLength;
    var oldLength = array.length;
    var newLength = array.length + diff;

    if (diff > 0) {
        // Head Tail Plus Minus
        // H H H H M M T T T T
        // H H H H P P P P T T T T
        //         ^ start
        //         ^-^ minus.length
        //           ^ --> diff
        //         ^-----^ plus.length
        //             ^------^ tail before
        //                 ^------^ tail after
        //                   ^ start iteration
        //                       ^ start iteration offset
        //             ^ end iteration
        //                 ^ end iteration offset
        //             ^ start + minus.length
        //                     ^ length
        //                   ^ length - 1
        for (var index = oldLength - 1; index >= start + minusLength; index--) {
            var offset = index + diff;
            if (index in array) {
                array[offset] = array[index];
            } else {
                // Oddly, PhantomJS complains about deleting array
                // properties, unless you assign undefined first.
                array[offset] = void 0;
                delete array[offset];
            }
        }
    }
    for (var index = 0; index < plus.length; index++) {
        if (index in plus) {
            array[start + index] = plus[index];
        } else {
            array[start + index] = void 0;
            delete array[start + index];
        }
    }
    if (diff < 0) {
        // Head Tail Plus Minus
        // H H H H M M M M T T T T
        // H H H H P P T T T T
        //         ^ start
        //         ^-----^ length
        //         ^-^ plus.length
        //             ^ start iteration
        //                 ^ offset start iteration
        //                     ^ end
        //                         ^ offset end
        //             ^ start + minus.length - plus.length
        //             ^ start - diff
        //                 ^------^ tail before
        //             ^------^ tail after
        //                     ^ length - diff
        //                     ^ newLength
        for (var index = start + plus.length; index < oldLength - diff; index++) {
            var offset = index - diff;
            if (offset in array) {
                array[index] = array[offset];
            } else {
                array[index] = void 0;
                delete array[index];
            }
        }
    }
    array.length = newLength;
}


}],["index.js","raf","index.js",{"performance-now":46},function (require, exports, module, __filename, __dirname){

// raf/index.js
// ------------

var now = require('performance-now')
  , global = typeof window === 'undefined' ? {} : window
  , vendors = ['moz', 'webkit']
  , suffix = 'AnimationFrame'
  , raf = global['request' + suffix]
  , caf = global['cancel' + suffix] || global['cancelRequest' + suffix]
  , isNative = true

for(var i = 0; i < vendors.length && !raf; i++) {
  raf = global[vendors[i] + 'Request' + suffix]
  caf = global[vendors[i] + 'Cancel' + suffix]
      || global[vendors[i] + 'CancelRequest' + suffix]
}

// Some versions of FF have rAF but not cAF
if(!raf || !caf) {
  isNative = false

  var last = 0
    , id = 0
    , queue = []
    , frameDuration = 1000 / 60

  raf = function(callback) {
    if(queue.length === 0) {
      var _now = now()
        , next = Math.max(0, frameDuration - (_now - last))
      last = next + _now
      setTimeout(function() {
        var cp = queue.slice(0)
        // Clear queue here to prevent
        // callbacks from appending listeners
        // to the current frame's queue
        queue.length = 0
        for(var i = 0; i < cp.length; i++) {
          if(!cp[i].cancelled) {
            try{
              cp[i].callback(last)
            } catch(e) {
              setTimeout(function() { throw e }, 0)
            }
          }
        }
      }, Math.round(next))
    }
    queue.push({
      handle: ++id,
      callback: callback,
      cancelled: false
    })
    return id
  }

  caf = function(handle) {
    for(var i = 0; i < queue.length; i++) {
      if(queue[i].handle === handle) {
        queue[i].cancelled = true
      }
    }
  }
}

module.exports = function(fn) {
  // Wrap in a new function to prevent
  // `cancel` potentially being assigned
  // to the native rAF function
  if(!isNative) {
    return raf.call(global, fn)
  }
  return raf.call(global, function() {
    try{
      fn.apply(this, arguments)
    } catch(e) {
      setTimeout(function() { throw e }, 0)
    }
  })
}
module.exports.cancel = function() {
  caf.apply(global, arguments)
}

}],["weak-map.js","weak-map","weak-map.js",{},function (require, exports, module, __filename, __dirname){

// weak-map/weak-map.js
// --------------------

// Copyright (C) 2011 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Install a leaky WeakMap emulation on platforms that
 * don't provide a built-in one.
 *
 * <p>Assumes that an ES5 platform where, if {@code WeakMap} is
 * already present, then it conforms to the anticipated ES6
 * specification. To run this file on an ES5 or almost ES5
 * implementation where the {@code WeakMap} specification does not
 * quite conform, run <code>repairES5.js</code> first.
 *
 * <p>Even though WeakMapModule is not global, the linter thinks it
 * is, which is why it is in the overrides list below.
 *
 * <p>NOTE: Before using this WeakMap emulation in a non-SES
 * environment, see the note below about hiddenRecord.
 *
 * @author Mark S. Miller
 * @requires crypto, ArrayBuffer, Uint8Array, navigator, console
 * @overrides WeakMap, ses, Proxy
 * @overrides WeakMapModule
 */

/**
 * This {@code WeakMap} emulation is observably equivalent to the
 * ES-Harmony WeakMap, but with leakier garbage collection properties.
 *
 * <p>As with true WeakMaps, in this emulation, a key does not
 * retain maps indexed by that key and (crucially) a map does not
 * retain the keys it indexes. A map by itself also does not retain
 * the values associated with that map.
 *
 * <p>However, the values associated with a key in some map are
 * retained so long as that key is retained and those associations are
 * not overridden. For example, when used to support membranes, all
 * values exported from a given membrane will live for the lifetime
 * they would have had in the absence of an interposed membrane. Even
 * when the membrane is revoked, all objects that would have been
 * reachable in the absence of revocation will still be reachable, as
 * far as the GC can tell, even though they will no longer be relevant
 * to ongoing computation.
 *
 * <p>The API implemented here is approximately the API as implemented
 * in FF6.0a1 and agreed to by MarkM, Andreas Gal, and Dave Herman,
 * rather than the offially approved proposal page. TODO(erights):
 * upgrade the ecmascript WeakMap proposal page to explain this API
 * change and present to EcmaScript committee for their approval.
 *
 * <p>The first difference between the emulation here and that in
 * FF6.0a1 is the presence of non enumerable {@code get___, has___,
 * set___, and delete___} methods on WeakMap instances to represent
 * what would be the hidden internal properties of a primitive
 * implementation. Whereas the FF6.0a1 WeakMap.prototype methods
 * require their {@code this} to be a genuine WeakMap instance (i.e.,
 * an object of {@code [[Class]]} "WeakMap}), since there is nothing
 * unforgeable about the pseudo-internal method names used here,
 * nothing prevents these emulated prototype methods from being
 * applied to non-WeakMaps with pseudo-internal methods of the same
 * names.
 *
 * <p>Another difference is that our emulated {@code
 * WeakMap.prototype} is not itself a WeakMap. A problem with the
 * current FF6.0a1 API is that WeakMap.prototype is itself a WeakMap
 * providing ambient mutability and an ambient communications
 * channel. Thus, if a WeakMap is already present and has this
 * problem, repairES5.js wraps it in a safe wrappper in order to
 * prevent access to this channel. (See
 * PATCH_MUTABLE_FROZEN_WEAKMAP_PROTO in repairES5.js).
 */

/**
 * If this is a full <a href=
 * "http://code.google.com/p/es-lab/wiki/SecureableES5"
 * >secureable ES5</a> platform and the ES-Harmony {@code WeakMap} is
 * absent, install an approximate emulation.
 *
 * <p>If WeakMap is present but cannot store some objects, use our approximate
 * emulation as a wrapper.
 *
 * <p>If this is almost a secureable ES5 platform, then WeakMap.js
 * should be run after repairES5.js.
 *
 * <p>See {@code WeakMap} for documentation of the garbage collection
 * properties of this WeakMap emulation.
 */
(function WeakMapModule() {
  "use strict";

  if (typeof ses !== 'undefined' && ses.ok && !ses.ok()) {
    // already too broken, so give up
    return;
  }

  /**
   * In some cases (current Firefox), we must make a choice betweeen a
   * WeakMap which is capable of using all varieties of host objects as
   * keys and one which is capable of safely using proxies as keys. See
   * comments below about HostWeakMap and DoubleWeakMap for details.
   *
   * This function (which is a global, not exposed to guests) marks a
   * WeakMap as permitted to do what is necessary to index all host
   * objects, at the cost of making it unsafe for proxies.
   *
   * Do not apply this function to anything which is not a genuine
   * fresh WeakMap.
   */
  function weakMapPermitHostObjects(map) {
    // identity of function used as a secret -- good enough and cheap
    if (map.permitHostObjects___) {
      map.permitHostObjects___(weakMapPermitHostObjects);
    }
  }
  if (typeof ses !== 'undefined') {
    ses.weakMapPermitHostObjects = weakMapPermitHostObjects;
  }

  // IE 11 has no Proxy but has a broken WeakMap such that we need to patch
  // it using DoubleWeakMap; this flag tells DoubleWeakMap so.
  var doubleWeakMapCheckSilentFailure = false;

  // Check if there is already a good-enough WeakMap implementation, and if so
  // exit without replacing it.
  if (typeof WeakMap === 'function') {
    var HostWeakMap = WeakMap;
    // There is a WeakMap -- is it good enough?
    if (typeof navigator !== 'undefined' &&
        /Firefox/.test(navigator.userAgent)) {
      // We're now *assuming not*, because as of this writing (2013-05-06)
      // Firefox's WeakMaps have a miscellany of objects they won't accept, and
      // we don't want to make an exhaustive list, and testing for just one
      // will be a problem if that one is fixed alone (as they did for Event).

      // If there is a platform that we *can* reliably test on, here's how to
      // do it:
      //  var problematic = ... ;
      //  var testHostMap = new HostWeakMap();
      //  try {
      //    testHostMap.set(problematic, 1);  // Firefox 20 will throw here
      //    if (testHostMap.get(problematic) === 1) {
      //      return;
      //    }
      //  } catch (e) {}

    } else {
      // IE 11 bug: WeakMaps silently fail to store frozen objects.
      var testMap = new HostWeakMap();
      var testObject = Object.freeze({});
      testMap.set(testObject, 1);
      if (testMap.get(testObject) !== 1) {
        doubleWeakMapCheckSilentFailure = true;
        // Fall through to installing our WeakMap.
      } else {
        module.exports = WeakMap;
        return;
      }
    }
  }

  var hop = Object.prototype.hasOwnProperty;
  var gopn = Object.getOwnPropertyNames;
  var defProp = Object.defineProperty;
  var isExtensible = Object.isExtensible;

  /**
   * Security depends on HIDDEN_NAME being both <i>unguessable</i> and
   * <i>undiscoverable</i> by untrusted code.
   *
   * <p>Given the known weaknesses of Math.random() on existing
   * browsers, it does not generate unguessability we can be confident
   * of.
   *
   * <p>It is the monkey patching logic in this file that is intended
   * to ensure undiscoverability. The basic idea is that there are
   * three fundamental means of discovering properties of an object:
   * The for/in loop, Object.keys(), and Object.getOwnPropertyNames(),
   * as well as some proposed ES6 extensions that appear on our
   * whitelist. The first two only discover enumerable properties, and
   * we only use HIDDEN_NAME to name a non-enumerable property, so the
   * only remaining threat should be getOwnPropertyNames and some
   * proposed ES6 extensions that appear on our whitelist. We monkey
   * patch them to remove HIDDEN_NAME from the list of properties they
   * returns.
   *
   * <p>TODO(erights): On a platform with built-in Proxies, proxies
   * could be used to trap and thereby discover the HIDDEN_NAME, so we
   * need to monkey patch Proxy.create, Proxy.createFunction, etc, in
   * order to wrap the provided handler with the real handler which
   * filters out all traps using HIDDEN_NAME.
   *
   * <p>TODO(erights): Revisit Mike Stay's suggestion that we use an
   * encapsulated function at a not-necessarily-secret name, which
   * uses the Stiegler shared-state rights amplification pattern to
   * reveal the associated value only to the WeakMap in which this key
   * is associated with that value. Since only the key retains the
   * function, the function can also remember the key without causing
   * leakage of the key, so this doesn't violate our general gc
   * goals. In addition, because the name need not be a guarded
   * secret, we could efficiently handle cross-frame frozen keys.
   */
  var HIDDEN_NAME_PREFIX = 'weakmap:';
  var HIDDEN_NAME = HIDDEN_NAME_PREFIX + 'ident:' + Math.random() + '___';

  if (typeof crypto !== 'undefined' &&
      typeof crypto.getRandomValues === 'function' &&
      typeof ArrayBuffer === 'function' &&
      typeof Uint8Array === 'function') {
    var ab = new ArrayBuffer(25);
    var u8s = new Uint8Array(ab);
    crypto.getRandomValues(u8s);
    HIDDEN_NAME = HIDDEN_NAME_PREFIX + 'rand:' +
      Array.prototype.map.call(u8s, function(u8) {
        return (u8 % 36).toString(36);
      }).join('') + '___';
  }

  function isNotHiddenName(name) {
    return !(
        name.substr(0, HIDDEN_NAME_PREFIX.length) == HIDDEN_NAME_PREFIX &&
        name.substr(name.length - 3) === '___');
  }

  /**
   * Monkey patch getOwnPropertyNames to avoid revealing the
   * HIDDEN_NAME.
   *
   * <p>The ES5.1 spec requires each name to appear only once, but as
   * of this writing, this requirement is controversial for ES6, so we
   * made this code robust against this case. If the resulting extra
   * search turns out to be expensive, we can probably relax this once
   * ES6 is adequately supported on all major browsers, iff no browser
   * versions we support at that time have relaxed this constraint
   * without providing built-in ES6 WeakMaps.
   */
  defProp(Object, 'getOwnPropertyNames', {
    value: function fakeGetOwnPropertyNames(obj) {
      return gopn(obj).filter(isNotHiddenName);
    }
  });

  /**
   * getPropertyNames is not in ES5 but it is proposed for ES6 and
   * does appear in our whitelist, so we need to clean it too.
   */
  if ('getPropertyNames' in Object) {
    var originalGetPropertyNames = Object.getPropertyNames;
    defProp(Object, 'getPropertyNames', {
      value: function fakeGetPropertyNames(obj) {
        return originalGetPropertyNames(obj).filter(isNotHiddenName);
      }
    });
  }

  /**
   * <p>To treat objects as identity-keys with reasonable efficiency
   * on ES5 by itself (i.e., without any object-keyed collections), we
   * need to add a hidden property to such key objects when we
   * can. This raises several issues:
   * <ul>
   * <li>Arranging to add this property to objects before we lose the
   *     chance, and
   * <li>Hiding the existence of this new property from most
   *     JavaScript code.
   * <li>Preventing <i>certification theft</i>, where one object is
   *     created falsely claiming to be the key of an association
   *     actually keyed by another object.
   * <li>Preventing <i>value theft</i>, where untrusted code with
   *     access to a key object but not a weak map nevertheless
   *     obtains access to the value associated with that key in that
   *     weak map.
   * </ul>
   * We do so by
   * <ul>
   * <li>Making the name of the hidden property unguessable, so "[]"
   *     indexing, which we cannot intercept, cannot be used to access
   *     a property without knowing the name.
   * <li>Making the hidden property non-enumerable, so we need not
   *     worry about for-in loops or {@code Object.keys},
   * <li>monkey patching those reflective methods that would
   *     prevent extensions, to add this hidden property first,
   * <li>monkey patching those methods that would reveal this
   *     hidden property.
   * </ul>
   * Unfortunately, because of same-origin iframes, we cannot reliably
   * add this hidden property before an object becomes
   * non-extensible. Instead, if we encounter a non-extensible object
   * without a hidden record that we can detect (whether or not it has
   * a hidden record stored under a name secret to us), then we just
   * use the key object itself to represent its identity in a brute
   * force leaky map stored in the weak map, losing all the advantages
   * of weakness for these.
   */
  function getHiddenRecord(key) {
    if (key !== Object(key)) {
      throw new TypeError('Not an object: ' + key);
    }
    var hiddenRecord = key[HIDDEN_NAME];
    if (hiddenRecord && hiddenRecord.key === key) { return hiddenRecord; }
    if (!isExtensible(key)) {
      // Weak map must brute force, as explained in doc-comment above.
      return void 0;
    }

    // The hiddenRecord and the key point directly at each other, via
    // the "key" and HIDDEN_NAME properties respectively. The key
    // field is for quickly verifying that this hidden record is an
    // own property, not a hidden record from up the prototype chain.
    //
    // NOTE: Because this WeakMap emulation is meant only for systems like
    // SES where Object.prototype is frozen without any numeric
    // properties, it is ok to use an object literal for the hiddenRecord.
    // This has two advantages:
    // * It is much faster in a performance critical place
    // * It avoids relying on Object.create(null), which had been
    //   problematic on Chrome 28.0.1480.0. See
    //   https://code.google.com/p/google-caja/issues/detail?id=1687
    hiddenRecord = { key: key };

    // When using this WeakMap emulation on platforms where
    // Object.prototype might not be frozen and Object.create(null) is
    // reliable, use the following two commented out lines instead.
    // hiddenRecord = Object.create(null);
    // hiddenRecord.key = key;

    // Please contact us if you need this to work on platforms where
    // Object.prototype might not be frozen and
    // Object.create(null) might not be reliable.

    try {
      defProp(key, HIDDEN_NAME, {
        value: hiddenRecord,
        writable: false,
        enumerable: false,
        configurable: false
      });
      return hiddenRecord;
    } catch (error) {
      // Under some circumstances, isExtensible seems to misreport whether
      // the HIDDEN_NAME can be defined.
      // The circumstances have not been isolated, but at least affect
      // Node.js v0.10.26 on TravisCI / Linux, but not the same version of
      // Node.js on OS X.
      return void 0;
    }
  }

  /**
   * Monkey patch operations that would make their argument
   * non-extensible.
   *
   * <p>The monkey patched versions throw a TypeError if their
   * argument is not an object, so it should only be done to functions
   * that should throw a TypeError anyway if their argument is not an
   * object.
   */
  (function(){
    var oldFreeze = Object.freeze;
    defProp(Object, 'freeze', {
      value: function identifyingFreeze(obj) {
        getHiddenRecord(obj);
        return oldFreeze(obj);
      }
    });
    var oldSeal = Object.seal;
    defProp(Object, 'seal', {
      value: function identifyingSeal(obj) {
        getHiddenRecord(obj);
        return oldSeal(obj);
      }
    });
    var oldPreventExtensions = Object.preventExtensions;
    defProp(Object, 'preventExtensions', {
      value: function identifyingPreventExtensions(obj) {
        getHiddenRecord(obj);
        return oldPreventExtensions(obj);
      }
    });
  })();

  function constFunc(func) {
    func.prototype = null;
    return Object.freeze(func);
  }

  var calledAsFunctionWarningDone = false;
  function calledAsFunctionWarning() {
    // Future ES6 WeakMap is currently (2013-09-10) expected to reject WeakMap()
    // but we used to permit it and do it ourselves, so warn only.
    if (!calledAsFunctionWarningDone && typeof console !== 'undefined') {
      calledAsFunctionWarningDone = true;
      console.warn('WeakMap should be invoked as new WeakMap(), not ' +
          'WeakMap(). This will be an error in the future.');
    }
  }

  var nextId = 0;

  var OurWeakMap = function() {
    if (!(this instanceof OurWeakMap)) {  // approximate test for new ...()
      calledAsFunctionWarning();
    }

    // We are currently (12/25/2012) never encountering any prematurely
    // non-extensible keys.
    var keys = []; // brute force for prematurely non-extensible keys.
    var values = []; // brute force for corresponding values.
    var id = nextId++;

    function get___(key, opt_default) {
      var index;
      var hiddenRecord = getHiddenRecord(key);
      if (hiddenRecord) {
        return id in hiddenRecord ? hiddenRecord[id] : opt_default;
      } else {
        index = keys.indexOf(key);
        return index >= 0 ? values[index] : opt_default;
      }
    }

    function has___(key) {
      var hiddenRecord = getHiddenRecord(key);
      if (hiddenRecord) {
        return id in hiddenRecord;
      } else {
        return keys.indexOf(key) >= 0;
      }
    }

    function set___(key, value) {
      var index;
      var hiddenRecord = getHiddenRecord(key);
      if (hiddenRecord) {
        hiddenRecord[id] = value;
      } else {
        index = keys.indexOf(key);
        if (index >= 0) {
          values[index] = value;
        } else {
          // Since some browsers preemptively terminate slow turns but
          // then continue computing with presumably corrupted heap
          // state, we here defensively get keys.length first and then
          // use it to update both the values and keys arrays, keeping
          // them in sync.
          index = keys.length;
          values[index] = value;
          // If we crash here, values will be one longer than keys.
          keys[index] = key;
        }
      }
      return this;
    }

    function delete___(key) {
      var hiddenRecord = getHiddenRecord(key);
      var index, lastIndex;
      if (hiddenRecord) {
        return id in hiddenRecord && delete hiddenRecord[id];
      } else {
        index = keys.indexOf(key);
        if (index < 0) {
          return false;
        }
        // Since some browsers preemptively terminate slow turns but
        // then continue computing with potentially corrupted heap
        // state, we here defensively get keys.length first and then use
        // it to update both the keys and the values array, keeping
        // them in sync. We update the two with an order of assignments,
        // such that any prefix of these assignments will preserve the
        // key/value correspondence, either before or after the delete.
        // Note that this needs to work correctly when index === lastIndex.
        lastIndex = keys.length - 1;
        keys[index] = void 0;
        // If we crash here, there's a void 0 in the keys array, but
        // no operation will cause a "keys.indexOf(void 0)", since
        // getHiddenRecord(void 0) will always throw an error first.
        values[index] = values[lastIndex];
        // If we crash here, values[index] cannot be found here,
        // because keys[index] is void 0.
        keys[index] = keys[lastIndex];
        // If index === lastIndex and we crash here, then keys[index]
        // is still void 0, since the aliasing killed the previous key.
        keys.length = lastIndex;
        // If we crash here, keys will be one shorter than values.
        values.length = lastIndex;
        return true;
      }
    }

    return Object.create(OurWeakMap.prototype, {
      get___:    { value: constFunc(get___) },
      has___:    { value: constFunc(has___) },
      set___:    { value: constFunc(set___) },
      delete___: { value: constFunc(delete___) }
    });
  };

  OurWeakMap.prototype = Object.create(Object.prototype, {
    get: {
      /**
       * Return the value most recently associated with key, or
       * opt_default if none.
       */
      value: function get(key, opt_default) {
        return this.get___(key, opt_default);
      },
      writable: true,
      configurable: true
    },

    has: {
      /**
       * Is there a value associated with key in this WeakMap?
       */
      value: function has(key) {
        return this.has___(key);
      },
      writable: true,
      configurable: true
    },

    set: {
      /**
       * Associate value with key in this WeakMap, overwriting any
       * previous association if present.
       */
      value: function set(key, value) {
        return this.set___(key, value);
      },
      writable: true,
      configurable: true
    },

    'delete': {
      /**
       * Remove any association for key in this WeakMap, returning
       * whether there was one.
       *
       * <p>Note that the boolean return here does not work like the
       * {@code delete} operator. The {@code delete} operator returns
       * whether the deletion succeeds at bringing about a state in
       * which the deleted property is absent. The {@code delete}
       * operator therefore returns true if the property was already
       * absent, whereas this {@code delete} method returns false if
       * the association was already absent.
       */
      value: function remove(key) {
        return this.delete___(key);
      },
      writable: true,
      configurable: true
    }
  });

  if (typeof HostWeakMap === 'function') {
    (function() {
      // If we got here, then the platform has a WeakMap but we are concerned
      // that it may refuse to store some key types. Therefore, make a map
      // implementation which makes use of both as possible.

      // In this mode we are always using double maps, so we are not proxy-safe.
      // This combination does not occur in any known browser, but we had best
      // be safe.
      if (doubleWeakMapCheckSilentFailure && typeof Proxy !== 'undefined') {
        Proxy = undefined;
      }

      function DoubleWeakMap() {
        if (!(this instanceof OurWeakMap)) {  // approximate test for new ...()
          calledAsFunctionWarning();
        }

        // Preferable, truly weak map.
        var hmap = new HostWeakMap();

        // Our hidden-property-based pseudo-weak-map. Lazily initialized in the
        // 'set' implementation; thus we can avoid performing extra lookups if
        // we know all entries actually stored are entered in 'hmap'.
        var omap = undefined;

        // Hidden-property maps are not compatible with proxies because proxies
        // can observe the hidden name and either accidentally expose it or fail
        // to allow the hidden property to be set. Therefore, we do not allow
        // arbitrary WeakMaps to switch to using hidden properties, but only
        // those which need the ability, and unprivileged code is not allowed
        // to set the flag.
        //
        // (Except in doubleWeakMapCheckSilentFailure mode in which case we
        // disable proxies.)
        var enableSwitching = false;

        function dget(key, opt_default) {
          if (omap) {
            return hmap.has(key) ? hmap.get(key)
                : omap.get___(key, opt_default);
          } else {
            return hmap.get(key, opt_default);
          }
        }

        function dhas(key) {
          return hmap.has(key) || (omap ? omap.has___(key) : false);
        }

        var dset;
        if (doubleWeakMapCheckSilentFailure) {
          dset = function(key, value) {
            hmap.set(key, value);
            if (!hmap.has(key)) {
              if (!omap) { omap = new OurWeakMap(); }
              omap.set(key, value);
            }
            return this;
          };
        } else {
          dset = function(key, value) {
            if (enableSwitching) {
              try {
                hmap.set(key, value);
              } catch (e) {
                if (!omap) { omap = new OurWeakMap(); }
                omap.set___(key, value);
              }
            } else {
              hmap.set(key, value);
            }
            return this;
          };
        }

        function ddelete(key) {
          var result = !!hmap['delete'](key);
          if (omap) { return omap.delete___(key) || result; }
          return result;
        }

        return Object.create(OurWeakMap.prototype, {
          get___:    { value: constFunc(dget) },
          has___:    { value: constFunc(dhas) },
          set___:    { value: constFunc(dset) },
          delete___: { value: constFunc(ddelete) },
          permitHostObjects___: { value: constFunc(function(token) {
            if (token === weakMapPermitHostObjects) {
              enableSwitching = true;
            } else {
              throw new Error('bogus call to permitHostObjects___');
            }
          })}
        });
      }
      DoubleWeakMap.prototype = OurWeakMap.prototype;
      module.exports = DoubleWeakMap;

      // define .constructor to hide OurWeakMap ctor
      Object.defineProperty(WeakMap.prototype, 'constructor', {
        value: WeakMap,
        enumerable: false,  // as default .constructor is
        configurable: true,
        writable: true
      });
    })();
  } else {
    // There is no host WeakMap, so we must use the emulation.

    // Emulated WeakMaps are incompatible with native proxies (because proxies
    // can observe the hidden name), so we must disable Proxy usage (in
    // ArrayLike and Domado, currently).
    if (typeof Proxy !== 'undefined') {
      Proxy = undefined;
    }

    module.exports = OurWeakMap;
  }
})();

}],["dom.js","wizdom","dom.js",{},function (require, exports, module, __filename, __dirname){

// wizdom/dom.js
// -------------

"use strict";

module.exports = Document;
function Document() {
    this.doctype = null;
    this.documentElement = null;
}

Document.prototype.nodeType = 9;
Document.prototype.Node = Node;
Document.prototype.Element = Element;
Document.prototype.TextNode = TextNode;
Document.prototype.Comment = Comment;
Document.prototype.Attr = Attr;
Document.prototype.NamedNodeMap = NamedNodeMap;

Document.prototype.createTextNode = function (text) {
    return new this.TextNode(this, text);
};

Document.prototype.createComment = function (text) {
    return new this.Comment(this, text);
};

Document.prototype.createElement = function (type) {
    return new this.Element(this, type);
};

Document.prototype.createAttribute = function (name) {
    return new this.Attr(this, name);
};

function Node(document) {
    this.ownerDocument = document;
    this.parentNode = null;
    this.firstChild = null;
    this.lastChild = null;
    this.previousSibling = null;
    this.nextSibling = null;
}

Node.prototype.appendChild = function appendChild(childNode) {
    return this.insertBefore(childNode, null);
};

Node.prototype.insertBefore = function insertBefore(childNode, nextSibling) {
    if (!childNode) {
        throw new Error("Can't insert null child");
    }
    if (childNode.ownerDocument !== this.ownerDocument) {
        throw new Error("Can't insert child from foreign document");
    }
    if (childNode.parentNode) {
        childNode.parentNode.removeChild(childNode);
    }
    var previousSibling;
    if (nextSibling) {
        previousSibling = nextSibling.previousSibling;
    } else {
        previousSibling = this.lastChild;
    }
    if (previousSibling) {
        previousSibling.nextSibling = childNode;
    }
    if (nextSibling) {
        nextSibling.previousSibling = childNode;
    }
    childNode.nextSibling = nextSibling;
    childNode.previousSibling = previousSibling;
    childNode.parentNode = this;
    if (!nextSibling) {
        this.lastChild = childNode;
    }
    if (!previousSibling) {
        this.firstChild = childNode;
    }
};

Node.prototype.removeChild = function removeChild(childNode) {
    if (!childNode) {
        throw new Error("Can't remove null child");
    }
    var parentNode = childNode.parentNode;
    if (parentNode !== this) {
        throw new Error("Can't remove node that is not a child of parent");
    }
    if (childNode === parentNode.firstChild) {
        parentNode.firstChild = childNode.nextSibling;
    }
    if (childNode === parentNode.lastChild) {
        parentNode.lastChild = childNode.previousSibling;
    }
    if (childNode.previousSibling) {
        childNode.previousSibling.nextSibling = childNode.nextSibling;
    }
    if (childNode.nextSibling) {
        childNode.nextSibling.previousSibling = childNode.previousSibling;
    }
    childNode.previousSibling = null;
    childNode.parentNode = null;
    childNode.nextSibling = null;
    return childNode;
};

function TextNode(document, text) {
    Node.call(this, document);
    this.data = text;
}

TextNode.prototype = Object.create(Node.prototype);
TextNode.prototype.constructor = TextNode;
TextNode.prototype.nodeType = 3;

function Comment(document, text) {
    Node.call(this, document);
    this.data = text;
}

Comment.prototype = Object.create(Node.prototype);
Comment.prototype.constructor = Comment;
Comment.prototype.nodeType = 8;

function Element(document, type) {
    Node.call(this, document);
    this.tagName = type;
    this.attributes = new this.ownerDocument.NamedNodeMap();
}

Element.prototype = Object.create(Node.prototype);
Element.prototype.constructor = Element;
Element.prototype.nodeType = 1;

Element.prototype.hasAttribute = function (name) {
    var attr = this.attributes.getNamedItem(name);
    return !!attr;
};

Element.prototype.getAttribute = function (name) {
    var attr = this.attributes.getNamedItem(name);
    return attr ? attr.value : null;
};

Element.prototype.setAttribute = function (name, value) {
    var attr = this.ownerDocument.createAttribute(name);
    attr.value = value;
    this.attributes.setNamedItem(attr);
};

Element.prototype.removeAttribute = function (name) {
    this.attributes.removeNamedItem(name);
};

function Attr(ownerDocument, name) {
    this.ownerDocument = ownerDocument;
    this.name = name;
    this.value = null;
}

Attr.prototype.nodeType = 2;

function NamedNodeMap() {
    this.length = 0;
}

NamedNodeMap.prototype.getNamedItem = function (name) {
    return this[name];
};

NamedNodeMap.prototype.setNamedItem = function (attr) {
    var name = attr.name;
    var previousAttr = this[name];
    if (!previousAttr) {
        this[this.length] = attr;
        this.length++;
        previousAttr = null;
    }
    this[name] = attr;
    return previousAttr;
};

NamedNodeMap.prototype.removeNamedItem = function (name) {
    var name = attr.name;
    var attr = this[name];
    if (!attr) {
        throw new Error("Not found");
    }
    var index = Array.prototype.indexOf.call(this, attr);
    delete this[name];
    delete this[index];
    this.length--;
};

NamedNodeMap.prototype.item = function (index) {
    return this[index];
};


}]])("gtor-demos/index.js")
