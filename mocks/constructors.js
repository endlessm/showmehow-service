// mocks/constructors.js
//
// Copyright (c) 2016-2017 Endless Mobile Inc.
//
// These mocks stub out the external functionality
// in showmehow-service so that we can test the
// controller itself.

const Lang = imports.lang;

const Controller = imports.lib.controller;

const ChatServiceStub = new Lang.Class({
    Name: 'ChatServiceStub',

    assignResponders: function(responders) {
        this._responders = responders;
    },

    openSession: function() {
        return this._responders.openSession.apply(this, Array.prototype.slice.call(arguments));
    },

    closeSession: function() {
        return this._responders.closeSession.apply(this, Array.prototype.slice.call(arguments));
    },

    attemptLessonWithInput: function() {
        return this._responders.attemptLessonWithInput.apply(this, Array.prototype.slice.call(arguments));
    }
});

