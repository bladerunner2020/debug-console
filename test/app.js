/* eslint-disable no-unused-vars */
/*global IR, DebugConsole*/

var debugConsole = null;

function kill() {
    if (!debugConsole) return;

    debugConsole.kill();
    debugConsole = null;
}

function initConsole() {
    if (debugConsole) return;

    // Создаем консоль для вывода отладочной информации
    debugConsole = new DebugConsole({
        lineCount: 25,
        maxBufferSize: 1024,
        noConsoleLog: false,
        // defaultPage: 'Main',
        debugPage: 'DebugPopup'});
    
    _Log('===== THIS IS FIRST MESSAGE =====');

    debugConsole.setColumnsCount(100);

    debugConsole.on('settings', function(arg1, arg2, arg3) {
        _Log('Settings are changed. ' + arg1 + ': ' + arg2 + ' = ' + arg3);
    });

    // Устанавливаем начальные настройки отладочной консоли
    debugConsole
        .setEventFilter('debug', true)  // Не показывать события debug
        .showField('source', false)     // Не показывать поле source
        .setFieldSizes({source : 15});
}

// Функции для вывода отладочной информации вместо IR.Log
// Если у debugConsole не стоит noConsoleLog, то вывод дублируется в IR.Log
function _Debug(message) {
    if (!debugConsole) {
        return;
    }

    debugConsole.log({event: 'debug', message: message, source: 'SCRIPT', timestamp : new Date()});
}

function _Log(message) {
    if (!debugConsole) {
        return;
    }

    debugConsole.log(message);
}

function _Error(message) {
    if (!debugConsole) {
        return;
    }

    debugConsole.log('ERROR: ' + message);
}

function _Warning(message) {
    if (!debugConsole) {
        return;
    }

    debugConsole.log('WARNING: ' + message);
}

// Функция для показа отладочной панели 
function showDebugConsole() {
    if (!debugConsole) {
        return;
    }

    debugConsole.showConsole();
}


initConsole();

// Генерируем тестовый контент для вывода 
var count = 0;
IR.SetInterval(1000, function () {
    var index = Math.floor(((Math.random() * 10))/10*5) + 1;
    count++;

    switch (index) {
    case 1:
        _Debug('This is debug message ' + count);
        break;
    case 2:
        _Log('Informational message = ' + count);
        break;
    case 3:
        _Error('Error. Shit happens. Oohps. Count = ' + count);
        break;
    case 4:
        _Warning('Just warning. ' + count);
        break;
    case 5:
        _Debug('Very long debug message. Long long very long. It is required to test multiline debug messages. few line messages...');
    }
});

