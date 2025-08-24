/**
 * Atropos 2.0.2
 * Touch-friendly 3D parallax hover effects
 * https://atroposjs.com
 *
 * Copyright 2021-2025 
 *
 * Released under the MIT License
 *
 * Released on: August 24, 2025
 */

var Atropos = (function () {
  'use strict';

  function _extends() {
    _extends = Object.assign ? Object.assign.bind() : function (target) {
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i];
        for (var key in source) {
          if (Object.prototype.hasOwnProperty.call(source, key)) {
            target[key] = source[key];
          }
        }
      }
      return target;
    };
    return _extends.apply(this, arguments);
  }

  /* eslint-disable no-restricted-globals */
  var $ = function $(el, sel) {
    return el.querySelector(sel);
  };
  var $$ = function $$(el, sel) {
    return el.querySelectorAll(sel);
  };
  var removeUndefinedProps = function removeUndefinedProps(obj) {
    if (obj === void 0) {
      obj = {};
    }
    var result = {};
    Object.keys(obj).forEach(function (key) {
      if (typeof obj[key] !== 'undefined') result[key] = obj[key];
    });
    return result;
  };
  var defaults = {
    alwaysActive: false,
    activeOffset: 50,
    shadowOffset: 50,
    shadowScale: 1,
    duration: 300,
    rotate: true,
    rotateTouch: true,
    rotateXMax: 15,
    rotateYMax: 15,
    rotateXInvert: false,
    rotateYInvert: false,
    stretchX: 0,
    stretchY: 0,
    stretchZ: 0,
    commonOrigin: true,
    shadow: true,
    highlight: true
  };
  function Atropos(originalParams) {
    if (originalParams === void 0) {
      originalParams = {};
    }
    var _originalParams = originalParams,
      el = _originalParams.el,
      eventsEl = _originalParams.eventsEl;
    var _originalParams2 = originalParams,
      isComponent = _originalParams2.isComponent;
    var childrenRootEl;
    var self = {
      __atropos__: true,
      params: _extends({}, defaults, {
        onEnter: null,
        onLeave: null,
        onRotate: null
      }, removeUndefinedProps(originalParams || {})),
      destroyed: false,
      isActive: false
    };
    var params = self.params;
    var rotateEl;
    var scaleEl;
    var innerEl;
    var elBoundingClientRect;
    var eventsElBoundingClientRect;
    var shadowEl;
    var highlightEl;
    var isScrolling;
    var clientXStart;
    var clientYStart;
    var queue = [];
    var queueFrameId;
    var purgeQueue = function purgeQueue() {
      queueFrameId = requestAnimationFrame(function () {
        queue.forEach(function (data) {
          if (typeof data === 'function') {
            data();
          } else {
            var element = data.element,
              prop = data.prop,
              value = data.value;
            element.style[prop] = value;
          }
        });
        queue.splice(0, queue.length);
        purgeQueue();
      });
    };
    purgeQueue();
    var $setDuration = function $setDuration(element, value) {
      queue.push({
        element: element,
        prop: 'transitionDuration',
        value: value
      });
    };
    var $setEasing = function $setEasing(element, value) {
      queue.push({
        element: element,
        prop: 'transitionTimingFunction',
        value: value
      });
    };
    var $setTransform = function $setTransform(element, value) {
      queue.push({
        element: element,
        prop: 'transform',
        value: value
      });
    };
    var $setOpacity = function $setOpacity(element, value) {
      queue.push({
        element: element,
        prop: 'opacity',
        value: value
      });
    };
    var $setOrigin = function $setOrigin(element, value) {
      queue.push({
        element: element,
        prop: 'transformOrigin',
        value: value
      });
    };
    var $on = function $on(element, event, handler, props) {
      return element.addEventListener(event, handler, props);
    };
    var $off = function $off(element, event, handler, props) {
      return element.removeEventListener(event, handler, props);
    };
    var createShadow = function createShadow() {
      var created;
      shadowEl = $(el, '.atropos-shadow');
      if (!shadowEl) {
        shadowEl = document.createElement('span');
        shadowEl.classList.add('atropos-shadow');
        created = true;
      }
      $setTransform(shadowEl, "translate3d(0,0,-" + params.shadowOffset + "px) scale(" + params.shadowScale + ")");
      if (created) {
        rotateEl.appendChild(shadowEl);
      }
    };
    var createHighlight = function createHighlight() {
      var created;
      highlightEl = $(el, '.atropos-highlight');
      if (!highlightEl) {
        highlightEl = document.createElement('span');
        highlightEl.classList.add('atropos-highlight');
        created = true;
      }
      $setTransform(highlightEl, "translate3d(0,0,0)");
      if (created) {
        innerEl.appendChild(highlightEl);
      }
    };
    var setChildrenOffset = function setChildrenOffset(_ref) {
      var _ref$rotateXPercentag = _ref.rotateXPercentage,
        rotateXPercentage = _ref$rotateXPercentag === void 0 ? 0 : _ref$rotateXPercentag,
        _ref$rotateYPercentag = _ref.rotateYPercentage,
        rotateYPercentage = _ref$rotateYPercentag === void 0 ? 0 : _ref$rotateYPercentag,
        duration = _ref.duration,
        opacityOnly = _ref.opacityOnly,
        easeOut = _ref.easeOut;
      var getOpacity = function getOpacity(element) {
        if (element.dataset.atroposOpacity && typeof element.dataset.atroposOpacity === 'string') {
          return element.dataset.atroposOpacity.split(';').map(function (v) {
            return parseFloat(v);
          });
        }
        return undefined;
      };
      $$(childrenRootEl, '[data-atropos-offset], [data-atropos-opacity]').forEach(function (childEl) {
        $setDuration(childEl, duration);
        $setEasing(childEl, easeOut ? 'ease-out' : '');
        var elementOpacity = getOpacity(childEl);
        if (rotateXPercentage === 0 && rotateYPercentage === 0) {
          if (!opacityOnly) $setTransform(childEl, "translate3d(0, 0, 0)");
          if (elementOpacity) $setOpacity(childEl, elementOpacity[0]);
        } else {
          var childElOffset = parseFloat(childEl.dataset.atroposOffset) / 100;
          if (!Number.isNaN(childElOffset) && !opacityOnly) {
            $setTransform(childEl, "translate3d(" + -rotateYPercentage * -childElOffset + "%, " + rotateXPercentage * -childElOffset + "%, 0)");
          }
          if (elementOpacity) {
            var min = elementOpacity[0],
              max = elementOpacity[1];
            var rotatePercentage = Math.max(Math.abs(rotateXPercentage), Math.abs(rotateYPercentage));
            $setOpacity(childEl, min + (max - min) * rotatePercentage / 100);
          }
        }
      });
    };
    var setElements = function setElements(clientX, clientY) {
      var isMultiple = el !== eventsEl;
      if (!elBoundingClientRect) {
        elBoundingClientRect = el.getBoundingClientRect();
      }
      if (isMultiple && !eventsElBoundingClientRect) {
        eventsElBoundingClientRect = eventsEl.getBoundingClientRect();
      }
      if (typeof clientX === 'undefined' && typeof clientY === 'undefined') {
        var rect = isMultiple ? eventsElBoundingClientRect : elBoundingClientRect;
        clientX = rect.left + rect.width / 2;
        clientY = rect.top + rect.height / 2;
      }
      var rotateX = 0;
      var rotateY = 0;
      var _elBoundingClientRect = elBoundingClientRect,
        top = _elBoundingClientRect.top,
        left = _elBoundingClientRect.left,
        width = _elBoundingClientRect.width,
        height = _elBoundingClientRect.height;
      var transformOrigin;
      if (!isMultiple) {
        var centerX = width / 2;
        var centerY = height / 2;
        var coordX = clientX - left;
        var coordY = clientY - top;
        rotateY = params.rotateYMax * (coordX - centerX) / (width / 2) * -1;
        rotateX = params.rotateXMax * (coordY - centerY) / (height / 2);
      } else {
        var _eventsElBoundingClie = eventsElBoundingClientRect,
          parentTop = _eventsElBoundingClie.top,
          parentLeft = _eventsElBoundingClie.left,
          parentWidth = _eventsElBoundingClie.width,
          parentHeight = _eventsElBoundingClie.height;
        var offsetLeft = left - parentLeft;
        var offsetTop = top - parentTop;
        var _centerX = width / 2 + offsetLeft;
        var _centerY = height / 2 + offsetTop;
        var _coordX = clientX - parentLeft;
        var _coordY = clientY - parentTop;
        rotateY = params.rotateYMax * (_coordX - _centerX) / (parentWidth - width / 2) * -1;
        rotateX = params.rotateXMax * (_coordY - _centerY) / (parentHeight - height / 2);
        transformOrigin = clientX - left + "px " + (clientY - top) + "px";
      }
      rotateX = Math.min(Math.max(-rotateX, -params.rotateXMax), params.rotateXMax);
      if (params.rotateXInvert) rotateX = -rotateX;
      rotateY = Math.min(Math.max(-rotateY, -params.rotateYMax), params.rotateYMax);
      if (params.rotateYInvert) rotateY = -rotateY;
      var rotateXPercentage = rotateX / params.rotateXMax * 100;
      var rotateYPercentage = rotateY / params.rotateYMax * 100;
      var stretchX = (isMultiple ? rotateYPercentage / 100 * params.stretchX : 0) * (params.rotateYInvert ? -1 : 1);
      var stretchY = (isMultiple ? rotateXPercentage / 100 * params.stretchY : 0) * (params.rotateXInvert ? -1 : 1);
      var stretchZ = isMultiple ? Math.max(Math.abs(rotateXPercentage), Math.abs(rotateYPercentage)) / 100 * params.stretchZ : 0;
      $setTransform(rotateEl, "translate3d(" + stretchX + "%, " + -stretchY + "%, " + -stretchZ + "px) rotateX(" + rotateX + "deg) rotateY(" + rotateY + "deg)");
      if (transformOrigin && params.commonOrigin) {
        $setOrigin(rotateEl, transformOrigin);
      }
      if (highlightEl) {
        $setDuration(highlightEl, params.duration + "ms");
        $setEasing(highlightEl, 'ease-out');
        $setTransform(highlightEl, "translate3d(" + -rotateYPercentage * 0.25 + "%, " + rotateXPercentage * 0.25 + "%, 0)");
        $setOpacity(highlightEl, Math.max(Math.abs(rotateXPercentage), Math.abs(rotateYPercentage)) / 100);
      }
      setChildrenOffset({
        rotateXPercentage: rotateXPercentage,
        rotateYPercentage: rotateYPercentage,
        duration: params.duration + "ms",
        easeOut: true
      });
      if (typeof params.onRotate === 'function') params.onRotate(rotateX, rotateY);
    };
    var activate = function activate() {
      queue.push(function () {
        return el.classList.add('atropos-active');
      });
      $setDuration(rotateEl, params.duration + "ms");
      $setEasing(rotateEl, 'ease-out');
      $setTransform(scaleEl, "translate3d(0,0, " + params.activeOffset + "px)");
      $setDuration(scaleEl, params.duration + "ms");
      $setEasing(scaleEl, 'ease-out');
      if (shadowEl) {
        $setDuration(shadowEl, params.duration + "ms");
        $setEasing(shadowEl, 'ease-out');
      }
      self.isActive = true;
    };
    var onPointerEnter = function onPointerEnter(e) {
      isScrolling = undefined;
      if (e.type === 'pointerdown' && e.pointerType === 'mouse') return;
      if (e.type === 'pointerenter' && e.pointerType !== 'mouse') return;
      if (e.type === 'pointerdown') {
        e.preventDefault();
      }
      clientXStart = e.clientX;
      clientYStart = e.clientY;
      if (params.alwaysActive) {
        elBoundingClientRect = undefined;
        eventsElBoundingClientRect = undefined;
        return;
      }
      activate();
      if (typeof params.onEnter === 'function') params.onEnter();
    };
    var onTouchMove = function onTouchMove(e) {
      if (isScrolling === false && e.cancelable) {
        e.preventDefault();
      }
    };
    var onPointerMove = function onPointerMove(e) {
      if (!params.rotate || !self.isActive) return;
      if (e.pointerType !== 'mouse') {
        if (!params.rotateTouch) return;
        e.preventDefault();
      }
      var clientX = e.clientX,
        clientY = e.clientY;
      var diffX = clientX - clientXStart;
      var diffY = clientY - clientYStart;
      if (typeof params.rotateTouch === 'string' && (diffX !== 0 || diffY !== 0) && typeof isScrolling === 'undefined') {
        if (diffX * diffX + diffY * diffY >= 25) {
          var touchAngle = Math.atan2(Math.abs(diffY), Math.abs(diffX)) * 180 / Math.PI;
          isScrolling = params.rotateTouch === 'scroll-y' ? touchAngle > 45 : 90 - touchAngle > 45;
        }
        if (isScrolling === false) {
          el.classList.add('atropos-rotate-touch');
          if (e.cancelable) {
            e.preventDefault();
          }
        }
      }
      if (e.pointerType !== 'mouse' && isScrolling) {
        return;
      }
      setElements(clientX, clientY);
    };
    var onPointerLeave = function onPointerLeave(e) {
      elBoundingClientRect = undefined;
      eventsElBoundingClientRect = undefined;
      if (!self.isActive) return;
      if (e && e.type === 'pointerup' && e.pointerType === 'mouse') return;
      if (e && e.type === 'pointerleave' && e.pointerType !== 'mouse') return;
      if (typeof params.rotateTouch === 'string' && isScrolling) {
        el.classList.remove('atropos-rotate-touch');
      }
      if (params.alwaysActive) {
        setElements();
        if (typeof params.onRotate === 'function') params.onRotate(0, 0);
        if (typeof params.onLeave === 'function') params.onLeave();
        return;
      }
      queue.push(function () {
        return el.classList.remove('atropos-active');
      });
      $setDuration(scaleEl, params.duration + "ms");
      $setEasing(scaleEl, '');
      $setTransform(scaleEl, "translate3d(0,0, " + 0 + "px)");
      if (shadowEl) {
        $setDuration(shadowEl, params.duration + "ms");
        $setEasing(shadowEl, '');
      }
      if (highlightEl) {
        $setDuration(highlightEl, params.duration + "ms");
        $setEasing(highlightEl, '');
        $setTransform(highlightEl, "translate3d(0, 0, 0)");
        $setOpacity(highlightEl, 0);
      }
      $setDuration(rotateEl, params.duration + "ms");
      $setEasing(rotateEl, '');
      $setTransform(rotateEl, "translate3d(0,0,0) rotateX(0deg) rotateY(0deg)");
      setChildrenOffset({
        duration: params.duration + "ms"
      });
      self.isActive = false;
      if (typeof params.onRotate === 'function') params.onRotate(0, 0);
      if (typeof params.onLeave === 'function') params.onLeave();
    };
    var onDocumentClick = function onDocumentClick(e) {
      var clickTarget = e.target;
      if (!eventsEl.contains(clickTarget) && clickTarget !== eventsEl && self.isActive) {
        onPointerLeave();
      }
    };
    var initDOM = function initDOM() {
      if (typeof el === 'string') {
        el = $(document, el);
      }
      if (!el) return;

      // eslint-disable-next-line
      if (el.__atropos__) return;
      if (typeof eventsEl !== 'undefined') {
        if (typeof eventsEl === 'string') {
          eventsEl = $(document, eventsEl);
        }
      } else {
        eventsEl = el;
      }
      childrenRootEl = isComponent ? el.parentNode.host : el;
      Object.assign(self, {
        el: el
      });
      rotateEl = $(el, '.atropos-rotate');
      scaleEl = $(el, '.atropos-scale');
      innerEl = $(el, '.atropos-inner');

      // eslint-disable-next-line
      el.__atropos__ = self;
    };
    var init = function init() {
      initDOM();
      if (!el || !eventsEl) return;
      if (params.shadow) {
        createShadow();
      }
      if (params.highlight) {
        createHighlight();
      }
      if (params.rotateTouch) {
        if (typeof params.rotateTouch === 'string') {
          el.classList.add("atropos-rotate-touch-" + params.rotateTouch);
        } else {
          el.classList.add('atropos-rotate-touch');
        }
      }
      if ($(childrenRootEl, '[data-atropos-opacity]')) {
        setChildrenOffset({
          opacityOnly: true
        });
      }
      $on(document, 'click', onDocumentClick);
      $on(eventsEl, 'pointerdown', onPointerEnter);
      $on(eventsEl, 'pointerenter', onPointerEnter);
      $on(eventsEl, 'pointermove', onPointerMove);
      $on(eventsEl, 'touchmove', onTouchMove);
      $on(eventsEl, 'pointerleave', onPointerLeave);
      $on(eventsEl, 'pointerup', onPointerLeave);
      $on(eventsEl, 'lostpointercapture', onPointerLeave);
      if (params.alwaysActive) {
        activate();
        setElements();
      }
    };
    var destroy = function destroy() {
      self.destroyed = true;
      cancelAnimationFrame(queueFrameId);
      $off(document, 'click', onDocumentClick);
      $off(eventsEl, 'pointerdown', onPointerEnter);
      $off(eventsEl, 'pointerenter', onPointerEnter);
      $off(eventsEl, 'pointermove', onPointerMove);
      $off(eventsEl, 'touchmove', onTouchMove);
      $off(eventsEl, 'pointerleave', onPointerLeave);
      $off(eventsEl, 'pointerup', onPointerLeave);
      $off(eventsEl, 'lostpointercapture', onPointerLeave);
      // eslint-disable-next-line
      delete el.__atropos__;
    };
    self.destroy = destroy;
    init();

    // eslint-disable-next-line
    return self;
  }

  return Atropos;

})();
//# sourceMappingURL=atropos.js.map
