// DebugConsole - outputs debug messages to special page debug console

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
        if (key == undefined) {
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
    }
}

function DebugConsole(options) {
    this.lineCount = (options && options.lineCount) ? options.lineCount : 25;
    this.defaultPageName = (options) ? options.defaultPage : null;
    this.debugPageName = options ? options.debugPage : null;
    this.noConsoleLog = (options) ? options.noConsoleLog : false;

    this.debugPage = IR.GetPopup(this.debugPageName);
    this.isPopup = !!this.debugPage;
    
    if (!this.isPopup) {
        this.debugPage = IR.GetPage(this.debugPageName);
    }
    
    this.active = false;

    this.messages = new RingBuffer((options && options.maxBufferSize) ? options.maxBufferSize : 1024);
    this.lastPage = null;

    this.eventFilter = {};
    this.sourceFilter = {};
    this.fieldFilter = {};


    var that = this;
    
    if (this.debugPage) {
        IR.AddListener(IR.EVENT_ITEM_SHOW, this.debugPage, function() {
            that.active = true;
            that.updateConsole();

            var page = that.debugPage;

            initButtonValue(page, 'PlayPause', that.active);
            initButtonValue(page, 'ShowDebug', !that.eventFilter.debug);
            initButtonValue(page, 'ShowInfo', !that.eventFilter.info);
            initButtonValue(page, 'ShowWarning', !that.eventFilter.warning);
            initButtonValue(page, 'ShowError', !that.eventFilter.error);
            initButtonValue(page, 'ShowTimestamp', !that.fieldFilter.timestamp);
            initButtonValue(page, 'ShowEvent', !that.fieldFilter.event);
            initButtonValue(page, 'ShowSource', !that.fieldFilter.source);
            initButtonValue(page, 'ShowMessage', !that.fieldFilter.message);
        });

        IR.AddListener(IR.EVENT_ITEM_HIDE, this.debugPage, function() {
            that.active = false;
        });

        IR.AddListener(IR.EVENT_ITEM_PRESS, this.debugPage.GetItem('Clear'), function(){
            that.clear();
            that.updateConsole();
        });

        IR.AddListener(IR.EVENT_ITEM_RELEASE, this.debugPage.GetItem('GoBack'), function(){
            that.hideConsole();
        });
        
        var button = that.debugPage.GetItem('PlayPause');
        IR.AddListener(IR.EVENT_ITEM_PRESS, button, function(){
            that.active = this.Value;
        }, button);
        
        button = this.debugPage.GetItem("ShowDebug");
        IR.AddListener(IR.EVENT_ITEM_RELEASE, button, function () {
            that.eventFilter.debug = !this.Value;
            that.updateConsole();
        }, button);

        button = this.debugPage.GetItem("ShowInfo");
        IR.AddListener(IR.EVENT_ITEM_RELEASE, button, function () {
            that.eventFilter.info = !this.Value;
            that.updateConsole();
        }, button);

        button = this.debugPage.GetItem("ShowWarning");
        IR.AddListener(IR.EVENT_ITEM_RELEASE, button, function () {
            that.eventFilter.warning = !this.Value;
            that.updateConsole();
        }, button);

        button = this.debugPage.GetItem("ShowError");
        IR.AddListener(IR.EVENT_ITEM_RELEASE, button, function () {
            that.eventFilter.error = !this.Value;
            that.updateConsole();
        }, button);

        button = this.debugPage.GetItem("ShowTimestamp");
        IR.AddListener(IR.EVENT_ITEM_RELEASE, button, function () {
            that.fieldFilter.timestamp = !this.Value;
            that.updateConsole();
        }, button);
        
        button = this.debugPage.GetItem("ShowEvent");
        IR.AddListener(IR.EVENT_ITEM_RELEASE, button, function () {
            that.fieldFilter.event = !this.Value;
            that.updateConsole();
        }, button);

        button = this.debugPage.GetItem("ShowSource");
        IR.AddListener(IR.EVENT_ITEM_RELEASE, button, function () {
            that.fieldFilter.source = !this.Value;
            that.updateConsole();
        }, button);
        
        button = this.debugPage.GetItem("ShowMessage");
        IR.AddListener(IR.EVENT_ITEM_RELEASE, button, function () {
            that.fieldFilter.message = !this.Value;
            that.updateConsole();
        }, button);
    }
    
    this.setLineCount = function (count) {
        this.lineCount = count;
    };
    
    this.log = function(msg) {
        if (typeof msg == 'string') {
            var msgObj = {};
            msgObj.message = msg;
            msgObj.event = 'info';
            msgObj.source = 'SCRIPT';
            msgObj.timestamp = new Date();

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
            if (msg.event && msg.event != 'info') {
                event = msg.event.toUpperCase() + ': ';
            }

            IR.Log(event + msg.message);
        }
    };
    
    this.showField = function (field, show) {
        this.fieldFilter[field] = !show;
        return this;
    };
    
    this.setEventFilter = function (event, hide) {
        this.eventFilter[event] = hide;
        return this;
    };

    this.setSourceFilter = function (source, hide) {
        this.sourceFilter[source] = hide;
        return this;
    };
    
    this.redefine = function (functionName, newFunction) {
        this[functionName] = newFunction;
        return this;
    };
    

    this.msgToString = function(msg) {
        var timestamp = '';
        if (!this.fieldFilter.timestamp) {
            timestamp = msg.timestamp;
            if (timestamp) {
                if (typeof timestamp != 'string') {
                    timestamp = timestamp.toString();
                }
            } else {
                timestamp = '';
            }
            timestamp = (timestamp + ' '.repeat(25)).slice(0, 25);
        }

        var source = !this.fieldFilter.source ? ((msg.source ? msg.source : '') + ' '.repeat(10)).slice(0, 10) : '';
        var event = !this.fieldFilter.event ? ((msg.event ? msg.event : '') + ' '.repeat(9)).slice(0, 9) : '';

        var text = (msg.message && !this.fieldFilter.message) ? msg.message : '';
        text = timestamp + event + source + text;

        return text;
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

    this.updateConsole = function(msg) {
        if (!that.debugPage) return;

        var console = that.debugPage.GetItem("Log");
        if (!console) {
            return;
        }

        console.Text =  this.getLastMessagesText(this.lineCount);
    };

    this.getMessageCount = function() {
        return  this.messages.length;
    };

    this.getMessage = function(index) {
        return that.messages.get(index);
    };

    this.getLastMessages = function(count) {
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

            if (!(event && this.eventFilter[event]) && !(source && this.sourceFilter[source])) {
                found++;
                result.push(msg);
            }
        }

        return result;
    };
    
    this.getLastMessagesText = function(count) {
        var messages = this.getLastMessages(count);

        var text = "";
        for (var i = messages.length - 1; i >= 0; i--) {
            text = text + this.msgToString(messages[i]) + "\n";
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
