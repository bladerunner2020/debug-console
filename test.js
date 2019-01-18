var messages = ['Hello my dear friends\r\nHow are you leaving?', 'message 2', 'some message hhhhh'];
var columnsCount = 10;

var max = 7;
var count = messages.length;
var lineCount = 0;
var index = 0;
var text = '';

var lines = [];

var re = new RegExp('(.{1,' + columnsCount + '})', 'g'); // Regular expression example: /(.{1,80})/g

while (lineCount < max) {
    if (lines.length == 0) {
        if (index >= count) { break; }
        var m = messages[count - index - 1];
        index++;
        var isLegit = true;
        if (!isLegit) { continue; }

        lines = (m || '').split(/\r\n|\r|\n/); // check if message has line breaks
        for (var j = lines.length - 1; j >=0; j--) {
            // split each lines into a number of lines depending on the line length and the insert into lines
            lines = lines.slice(0, j).concat((lines[j] || '').match(re), lines.slice(j+1));
        }
    }
    var msgText = lines.pop();
    text = msgText + '\n' + text;
    lineCount++; 
}


console.log(text);