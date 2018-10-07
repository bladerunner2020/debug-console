// Создаем консоль для вывода отладочной информации
var debugConsole = new DebugConsole({
    lineCount: 25,
    maxBufferSize: 1024,
    noConsoleLog: false,
    // defaultPage: 'Main',
    debugPage: 'DebugPopup'});

// Устанавливаем начальные настройки отладочной консоли
debugConsole
    .setEventFilter('debug', true)  // Не показывать события debug
    .showField('source', false);    // Не показывать поле source


// Функции для вывода отладочной информации вместо IR.Log
// Если у debugConsole не стоит noConsoleLog, то вывод дублируется в IR.Log
function _Debug(message) {
    debugConsole.log({event: 'debug', message: message, source: 'SCRIPT', timestamp : new Date()});
}

function _Log(message) {
    debugConsole.log(message);
}

function _Error(message) {
    debugConsole.log('ERROR: ' + message);
}

function _Warning(message) {
    debugConsole.log('WARNING: ' + message);
}

// Функция для показа отладочной панели 
function showDebugConsole() {
    debugConsole.showConsole();
}


// Генерируем тестовый контент для вывода 
var count = 0;
IR.SetInterval(1000, function () {
    var index = Math.floor(((Math.random() * 10))/10*4) + 1;
    count++;

    switch (index) {
        case 1:
            _Debug('count = ' + count);
            break;
        case 2:
            _Log('count = ' + count);
            break;
        case 3:
            _Error('count = ' + count);
            break;
        case 4:
            _Warning('count = ' + count);
    }
});



