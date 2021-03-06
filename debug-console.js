// DebugConsole - outputs debug messages to special page debug console
/*global IR*/

function RingBuffer(length) {
    this.buffer = [];
    this.length = 0;
    this.pointer = 0;

    this.push = function (item) {
        this.buffer[this.pointer] = item;
        this.pointer = (this.pointer + 1)  % length;
        this.length =  this.buffer.length;

        return this.length;
    };

    this.get = function (key) {
        if (typeof key === 'undefined') {
            return this.buffer[this.pointer - 1];
        }
        var index = (this.pointer + key) % this.length;

        return this.buffer[index];
    };
    
    this.clear = function () {
        this.buffer.length = 0;
        this.length = 0;
        this.pointer = 0;
    };
}

if (!String.prototype.repeat) {
    String.prototype.repeat = function(count) {
        'use strict';
        if (this == null) {
            throw new TypeError('can\'t convert ' + this + ' to object');
        }
        var str = '' + this;
        count = +count;
        if (count != count) {
            count = 0;
        }
        if (count < 0) {
            throw new RangeError('repeat count must be non-negative');
        }
        if (count == Infinity) {
            throw new RangeError('repeat count must be less than infinity');
        }
        count = Math.floor(count);
        if (str.length == 0 || count == 0) {
            return '';
        }
        // Ensuring count is a 31-bit integer allows us to heavily optimize the
        // main part. But anyway, most current (August 2014) browsers can't handle
        // strings 1 << 28 chars or longer, so:
        if (str.length * count >= 1 << 28) {
            throw new RangeError('repeat count must not overflow maximum string size');
        }
        var maxCount = str.length * count;
        count = Math.floor(Math.log(count) / Math.log(2));
        while (count) {
            str += str;
            count--;
        }
        str += str.substring(0, maxCount - str.length);
        return str;
    };
}

function DebugConsole(options) {
    this.lineCount = (options && options.lineCount) ? options.lineCount : 25;
    this.defaultPageName = (options) ? options.defaultPage : null;
    this.debugPageName = options ? options.debugPage : null;
    this.noConsoleLog = (options) ? options.noConsoleLog : false;

    this.debugPage = IR.GetPopup(this.debugPageName);
    this.isPopup = !!this.debugPage;

    this._eventCallbacks = {};
    
    if (!this.isPopup) {
        this.debugPage = IR.GetPage(this.debugPageName);
    }
    
    this.fieldSizes = {
        timestamp : 25,
        event : 9,
        source : 10
    };

    this.consoleDisabled = false;
    
    this.active = false;

    this.messages = new RingBuffer((options && options.maxBufferSize) ? options.maxBufferSize : 1024);
    this.lastPage = null;

    this.eventFilter = {};
    this.sourceFilter = {};
    this.fieldFilter = {};

    this.columnsCount = undefined;


    var that = this;

    this.registerListener = function (cb, data) {
        var button = this.debugPage.GetItem(data.itemName);
        if (button) {
            IR.AddListener(IR.EVENT_ITEM_RELEASE, button, cb, data);
        }

        return this;
    };

    this.unregisterListener = function (cb, data) {
        var button = this.debugPage.GetItem(data.itemName);
        if (button) {
            IR.RemoveListener(IR.EVENT_ITEM_RELEASE, button, cb);
        }

        return this;
    };

    this.on = function(event, callback) {
        if (this._eventCallbacks[event]) {
            throw new Error('Callback for this event is already set: ' + event);
        }
    
        this._eventCallbacks[event] = callback;
        return this;
    };

    this.callEvent = function(/* event, arg1, arg2 ...*/) {
        var args = Array.prototype.slice.call(arguments, 0);
        var event = args.shift();
        if (this._eventCallbacks[event]) {
            this._eventCallbacks[event].apply(this, args);
        }
    };
    
    if (this.debugPage) {
        IR.AddListener(IR.EVENT_ITEM_SHOW, this.debugPage, onConsoleShow);
        IR.AddListener(IR.EVENT_ITEM_HIDE, this.debugPage, onConsoleHide);

        this.registerListener(onClearItemPressed, {itemName: 'Clear'});
        this.registerListener(onGoBackItemPressed, {itemName: 'GoBack'});

        this.registerListener(onPlayItemPressed, {itemName: 'PlayPause'});

        this.registerListener(onItemPressed, {itemName: 'ShowDebug', path: ['eventFilter', 'debug']});
        this.registerListener(onItemPressed, {itemName: 'ShowInfo', path: ['eventFilter', 'info']});
        this.registerListener(onItemPressed, {itemName: 'ShowWarning', path: ['eventFilter', 'warning']});
        this.registerListener(onItemPressed, {itemName: 'ShowError', path: ['eventFilter', 'error']});        

        this.registerListener(onItemPressed, {itemName: 'ShowTimestamp', path: ['fieldFilter', 'timestamp']});
        this.registerListener(onItemPressed, {itemName: 'ShowEvent', path: ['fieldFilter', 'event']});
        this.registerListener(onItemPressed, {itemName: 'ShowSource', path: ['fieldFilter', 'source']});
        this.registerListener(onItemPressed, {itemName: 'ShowMessage', path: ['fieldFilter', 'message']});
    }
    
    function onConsoleShow(notChangeActive) {
        if (!notChangeActive) {
            that.active = true;
        }

        if (that.active) {
            that.updateConsole();
            initButtonValue(that.debugPage, 'PlayPause', that.active);
            initButtonValue(that.debugPage, 'ShowDebug', !that.eventFilter.debug);
            initButtonValue(that.debugPage, 'ShowInfo', !that.eventFilter.info);
            initButtonValue(that.debugPage, 'ShowWarning', !that.eventFilter.warning);
            initButtonValue(that.debugPage, 'ShowError', !that.eventFilter.error);
            initButtonValue(that.debugPage, 'ShowTimestamp', !that.fieldFilter.timestamp);
            initButtonValue(that.debugPage, 'ShowEvent', !that.fieldFilter.event);
            initButtonValue(that.debugPage, 'ShowSource', !that.fieldFilter.source);
            initButtonValue(that.debugPage, 'ShowMessage', !that.fieldFilter.message);    
        } 
    }

    function onConsoleHide() {
        that.active = false;
    }

    function onGoBackItemPressed() {
        that.hideConsole();
    }

    function onClearItemPressed() {
        that.clear();
        that.updateConsole();
    }

    /** @this onPlayItemPressed */
    function onPlayItemPressed() {
        var button = that.debugPage.GetItem(this.itemName);
        that.active = button.Value;
    }

    /** @this onItemPressed */
    function onItemPressed() {
        // К this привязана структура {item : button, obj : objName, prop: propName}

        var button = that.debugPage.GetItem(this.itemName);
        var len = this.path.length;
        if (button) {
            var object = that;
            for (var i = 0; i < len - 1; i++) {
                object = object[this.path[i]];
            }
            object[this.path[len - 1]] = !button.Value;

            if (len > 1) {     // Это означает, что нажата кнопка фильтров
                that.callEvent('settings', this.path[len - 2], this.path[len - 1], !button.Value);
            }
        }

        that.updateConsole();
    }

    this.kill = function () {
        this.clear();
        
        if (this.debugPage) {
            IR.RemoveListener(IR.EVENT_ITEM_SHOW, this.debugPage, onConsoleShow);
            IR.RemoveListener(IR.EVENT_ITEM_HIDE, this.debugPage, onConsoleHide);

            this.unregisterListener(onGoBackItemPressed, {itemName: 'Clear'});
            this.unregisterListener(onGoBackItemPressed, {itemName: 'GoBack'});

            this.unregisterListener(onItemPressed, {itemName: 'PlayPause'});

            this.unregisterListener(onItemPressed, {itemName: 'ShowDebug'});
            this.unregisterListener(onItemPressed, {itemName: 'ShowInfo'});
            this.unregisterListener(onItemPressed, {itemName: 'ShowWarning'});
            this.unregisterListener(onItemPressed, {itemName: 'ShowError'});

            this.unregisterListener(onItemPressed, {itemName: 'ShowTimestamp'});
            this.unregisterListener(onItemPressed, {itemName: 'ShowEvent'});
            this.unregisterListener(onItemPressed, {itemName: 'ShowSource'});
            this.unregisterListener(onItemPressed, {itemName: 'ShowMessage'});
        }
    };
    
    this.setLineCount = function (count) {
        this.lineCount = count;

        return this;
    };
    
    this.setFieldSizes = function (fieldSizes) {
        for (var key in fieldSizes) {
            if (fieldSizes.hasOwnProperty(key)) {
                this.fieldSizes[key] = fieldSizes[key];
            }
        }
        
        return this;
    };

    this.setColumnsCount = function(count) {
        this.columnsCount = count;

        return this;
    };
    
    this.log = function(msg) {
        if (this.consoleDisabled) {
            return;
        }
        
        if (typeof msg === 'string') {
            var msgObj = {};
            msgObj.message = msg;
            msgObj.event = 'info';
            msgObj.source = 'SCRIPT';

            var d = new Date();
            msgObj.timestamp = 
                ('00' + d.getDate()).slice(-2) + '-' +
                ('00' + (d.getMonth() + 1)).slice(-2) + '-' +
                d.getFullYear() + ' ' +
                ('00' + d.getHours()).slice(-2) + ':' +
                ('00' + d.getMinutes()).slice(-2) + ':' +
                ('00' + d.getSeconds()).slice(-2) + '.' +
                ('000' + d.getMilliseconds()).slice(-3);

            if (msgObj.message.indexOf('DEBUG: ') == 0) {
                msgObj.event = 'debug';
                msgObj.message = msgObj.message.substr(7);
            } else if (msgObj.message.indexOf('ERROR: ') == 0) {
                msgObj.event = 'error';
                msgObj.message = msgObj.message.substr(7);
            } else if (msgObj.message.indexOf('WARNING: ') == 0) {
                msgObj.event = 'warning';
                msgObj.message = msgObj.message.substr(9);
            }
            
            msg = msgObj;
        }
        
        this.messages.push(msg);

        if (this.active) {
            this.updateConsole(msg);
        }

        if (!this.noConsoleLog) {
            var event = '';
            if (msg.event && msg.event !== 'info') {
                event = msg.event.toUpperCase() + ': ';
            }

            IR.Log(event + msg.message);
        }
    };
    
    this.showField = function (field, show) {
        if (this.fieldFilter[field] != !show) {
            this.fieldFilter[field] = !show;
            this.callEvent('settings', 'showField', field, show);
            onConsoleShow(true); // update console
        }
        return this;
    };
    
    this.setEventFilter = function (event, hide) {
        if (this.eventFilter[event] != hide) {
            this.eventFilter[event] = hide;
            this.callEvent('settings', 'eventFilter', event, hide);
            onConsoleShow(true); // update console
        }

        return this;
    };

    this.setSourceFilter = function (source, hide) {
        if (this.sourceFilter[source] != hide) {
            this.sourceFilter[source] = hide;
            this.callEvent('settings', 'sourceFilter', source, hide);
            onConsoleShow(true); // update console
        }

        return this;
    };
    
    this.redefine = function (functionName, newFunction) {
        this[functionName] = newFunction;
        return this;
    };

    this.disableConsole = function () {
        this.consoleDisabled = true;
        return this;
    };

    this.enableConsole = function () {
        this.consoleDisabled = false;
        return this;
    };

    this.msgToString = function(msg, ignoreFilter) {
        var text = (msg.message && ((ignoreFilter || !this.fieldFilter.message))) ? msg.message : '';
        text = this.msgToInfoString(msg, ignoreFilter) + text;

        return text;
    };

    this.msgToInfoString = function(msg, ignoreFilter) {
        var timestamp = '';
        if (!this.fieldFilter.timestamp || ignoreFilter) {
            timestamp = msg.timestamp;
            if (timestamp) {
                if (typeof timestamp !== 'string') {
                    timestamp = timestamp.toString();
                }
            } else {
                timestamp = '';
            }
            timestamp = (timestamp + ' '.repeat(this.fieldSizes.timestamp)).slice(0, this.fieldSizes.timestamp);
        }

        var source = (ignoreFilter || !this.fieldFilter.source) ? ((msg.source ? msg.source : '') + 
                ' '.repeat(this.fieldSizes.source)).slice(0, this.fieldSizes.source) : '';
        var event = (ignoreFilter || !this.fieldFilter.event) ? ((msg.event ? msg.event : '') + 
                ' '.repeat(this.fieldSizes.event)).slice(0, this.fieldSizes.event) : '';

        return timestamp + event + source;
    };

    this.calculateMessageOffset = function(ignoreFilter) {
        return (this.msgToInfoString({})).length;
    };


    this.showConsole = function () {
        if (this.isPopup) {
            IR.ShowPopup(this.debugPageName);
        } else if (this.debugPageName){
            var lastPage = IR.CurrentPage ? IR.CurrentPage.Name : null;             
            
            if (lastPage != this.debugPageName) {
                IR.ShowPage(this.debugPageName);
                this.lastPage = lastPage;
            }
        }
    };
    
    this.hideConsole = function () {
        if (this.isPopup) {
            IR.HidePopup(this.debugPageName);
        } else {
            var name = this.lastPage ? this.lastPage : this.defaultPageName;
            if (name) {
                IR.ShowPage(name);
                this.lastPage = null;
            }
        }
    };

    // eslint-disable-next-line no-unused-vars
    this.updateConsole = function(msg) {
        function getLineCount(s) {
            return s.split(/\r\n|\r|\n/).length;
        }
        
        if (!that.debugPage) {
            return;
        }

        var console = that.debugPage.GetItem('Log');
        if (!console) {
            return;
        }

        var offset = this.calculateMessageOffset();
        var columnsCount = this.columnsCount ? this.columnsCount - offset : null;
        if (columnsCount <= 0) { columnsCount = null; }

        var empty = ' '.repeat(offset);

        var count = this.getMessageCount();
        var lineCount = 0;
        var index = 0;
        var text = '';

        var lines = [];
        var re = columnsCount ? new RegExp('(.{1,' + columnsCount + '})', 'g') : ''; // Regular expression example: /(.{1,80})/g

        while (lineCount < this.lineCount) {
            if (lines.length == 0) {
                if (index >= count) { break; }
                var m = this.getMessage(count - index - 1);
                index++;
                var isLegit = !(m.event && this.eventFilter[m.event]) && !(m.source && this.sourceFilter[m.source]);
                if (!isLegit) { continue; }

                lines = (m.message || '').split(/\r\n|\r|\n/); // check if message has line breaks
  
                if (columnsCount) {
                    for (var j = lines.length - 1; j >=0; j--) {
                        // split each lines into a number of lines depending on the line length and the insert into lines
                        lines = lines.slice(0, j).concat((lines[j] || '').match(re), lines.slice(j+1));
                    }
                }
            }
            var msgText = lines.pop();
            if (msgText == '') { continue; }

            text = lines.length ? (empty + msgText + '\n' + text) : this.msgToInfoString(m) + msgText + '\n' + text;
            lineCount++; 
        }

        console.Text = text;

        // console.Text =  this.getLastMessagesText(this.lineCount);
    };

    this.getMessageCount = function() {
        return  this.messages.length;
    };

    this.getMessage = function(index) {
        return that.messages.get(index);
    };

    this.getLastMessages = function(count, ignoreFilter) {
        if (count == undefined || count > that.messages.length) {
            count = this.messages.length;
        }

        var result = [];
        var found = 0;

        for (var i = this.messages.length - 1; i >=0; i--) {
            if (found >= count) break;

            var msg = this.messages.get(i);
            var event = msg.event;
            var source = msg.source;

            if (ignoreFilter || (!(event && this.eventFilter[event]) && !(source && this.sourceFilter[source]))) {
                found++;
                result.push(msg);
            }
        }

        return result;
    };
    
    this.getLastMessagesText = function(count, ignoreFilter) {
        var messages = this.getLastMessages(count, ignoreFilter);

        var text = '';
        for (var i = messages.length - 1; i >= 0; i--) {
            text = text + this.msgToString(messages[i], ignoreFilter) + '\n';
        }

        return text;
    };

    this.clear = function() {
        this.messages.clear();
    };


    function initButtonValue(page, name, value, defValue) {
        if (page) {
            var button = page.GetItem(name);
            if (button) {
                button.Value = (value != undefined) ? value : defValue;
            }
        }
    }
}

// Necessary to use in IridiumMobile
if ((typeof IR === 'object') && (typeof module === 'object')) {
    module['debug-console'] = {
        DebugConsole: DebugConsole    
    };
    exports = undefined;
} 
