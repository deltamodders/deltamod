const console = require('./Console.js');

function runWMIC(command, callback) {
    return new Promise((resolve, reject) => {
        console.log('Executing WMIC command:', command);
        var exec = require('child_process').exec;
        exec('wmic ' + command, function (error, stdout, stderr) {
            if (error) {
                return reject({stderr: stderr, stdout: stdout, error: error});
            }
            resolve({stdout: stdout, stderr: stderr, error: error});
        });
    });
}

async function getFileAttributes(filePath) {
    var escapedPath = (filePath).replaceAll('\\', '\\\\');
    console.log('Getting file attributes for:', escapedPath);
    try {
        const result = await runWMIC(`datafile where name='${escapedPath}' get /format:list`);
        var resultDivided = result.stdout.split('\r\r\n');
        var resultObj = {};
        resultDivided.forEach(line => {
            var parts = line.split('=');
            if (parts.length === 2) {
                var p1 = parts[1].trim();
                if (p1 === 'TRUE') p1 = true;
                else if (p1 === 'FALSE') p1 = false;
                else if (!isNaN(p1)) p1 = Number(p1);
                resultObj[parts[0].trim()] = p1;
            }
        });
        return resultObj;
    } catch (error) {
        console.error('Error retrieving file attributes:', error);
    }
}

module.exports = { getFileAttributes };