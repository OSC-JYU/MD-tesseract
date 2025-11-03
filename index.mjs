import Hapi from '@hapi/hapi';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import formidable from 'formidable';
import { spawn } from 'child_process';



// ******* ROUTES ************

const init = async () => {
    const server = Hapi.server({
        port: process.env.PORT || 8400,
        host: '0.0.0.0'
    });

    server.route({
        method: 'GET',
        path: '/',
        handler: (request, h) => {
            return 'md-tesseract API';
        }
    });

    server.route({
        method: 'POST',
        path: '/process',
        options: {
            payload: {
                output: 'stream',
                parse: false,
                maxBytes: 1048576,
                allow: 'multipart/form-data'
            }
        },
        handler: async (request, h) => {
            let output = {
                response: {
                    type: "stored",
                    uri: []
                }
            }

            // Parse multipart using formidable
            const form = formidable({
                uploadDir: './uploads',
                keepExtensions: true,
                maxFileSize: 1048576
            });

            const { fields, files: filesParsed } = await new Promise((resolve, reject) => {
                form.parse(request.payload, (err, fields, filesParsed) => {
                    if (err) return reject(err);
                    resolve({ fields, files: filesParsed });
                });
            });
            
            console.log('Files received:', Object.keys(filesParsed));
            
            // Helper function to get file path from formidable file object (handles both single file and array)
            // Formidable file objects have properties: filepath (or path), originalFilename, mimetype, size
            // If multiple files are uploaded with the same field name, formidable returns an array
            const getFilePath = (file) => {
                if (!file) return null;
                // If it's an array, get the first file
                if (Array.isArray(file)) {
                    return file[0]?.filepath || file[0]?.path || null;
                }
                // If it's a single file object, return its path
                return file.filepath || file.path || null;
            };

            // Helper function to get the full file object (not just path)
            // Use this to access other properties like originalFilename, mimetype, size
            const getFile = (file) => {
                if (!file) return null;
                return Array.isArray(file) ? file[0] : file;
            };

            // Try to find the message/request file and content file
            let messageFile = filesParsed.message || filesParsed.request;
            let contentFile = filesParsed.content;

            if (!messageFile || !contentFile) {
                console.error('Missing files. Available fields:', Object.keys(filesParsed));
                return h.response({ error: 'Missing required files', availableFields: Object.keys(filesParsed) }).code(400);
            }

            // Get file paths
            const messageFilepath = getFilePath(messageFile);
            const contentFilepath = getFilePath(contentFile);

            if (!messageFilepath || !contentFilepath) {
                return h.response({ error: 'Could not determine file paths', messageFilepath, contentFilepath }).code(400);
            }


            try {
                // Create dirname based on filename (e.g., /data/234jh242398fdfsef.jpg)
                
                const filename = path.basename(contentFilepath);
                const dirname = path.join('data', filename);
                await fs.mkdir(dirname, { recursive: true });
                console.log('dirname', dirname);

                // Parse message file as JSON
                let messageJSON;
                try {
                    // Try reading as JSON directly (fs.readJSON automatically parses)
                    messageJSON = await fs.readJSON(messageFilepath);
                } catch (parseError) {
                    // If readJSON fails, read as text and parse manually
                    const messageText = await fs.readFile(messageFilepath, 'utf-8');
                    messageJSON = JSON.parse(messageText);
                }
                
                // Ensure messageJSON is an object (handle double-encoded JSON strings)
                if (typeof messageJSON === 'string') {
                    messageJSON = JSON.parse(messageJSON);
                }
                
                // Validate message structure
                if (!messageJSON || !messageJSON.task || !messageJSON.task.id) {
                    throw new Error('Invalid message format: missing task.id');
                }
                
                const task = messageJSON.task.id;

                // Ensure params object exists
                if (!messageJSON.task.params) {
                    messageJSON.task.params = {};
                }

                // convert array to string for 'lang'
                if (Array.isArray(messageJSON.task.params['lang'])) {
                    messageJSON.task.params['lang'] = messageJSON.task.params['lang'].join('+');
                }

                if (task == 'image2text') {
                    output.response.uri = await tesseractToText([contentFilepath], messageJSON.task.params, dirname, 'text');
                } else if (task == 'searchable_pdf') {
                    output.response.uri = await tesseractToPDF(contentFilepath, messageJSON.task.params, dirname, "file");
                } else if (task == 'image2hocr') {
                    output.response.uri = await tesseractToHOCR(contentFilepath, messageJSON.task.params, dirname, 'text.hocr');
                } else if (task == 'orientation_detection') {
                    output.response.uri = await tesseractToOSD(contentFilepath, messageJSON.task.params, dirname, "orientation.osd.json");
                }

                await fs.unlink(contentFilepath);
                await fs.unlink(messageFilepath);

            } catch (e) {
                console.log(e);
                console.log(e.message);
                try {
                    if (contentFilepath) await fs.unlink(contentFilepath);
                    if (messageFilepath) await fs.unlink(messageFilepath);
                    await fs.rm(dirname, { recursive: true });
                } catch (e) {
                    console.log('Removing of temp files failed');
                }
            }

            return output;
        }
    });

    server.route({
        method: 'GET',
        path: '/files/{dir}/{file}',
        handler: async (request, h) => {
            const input_path = path.join('data', request.params.dir, request.params.file);
            
            // Check if file exists
            try {
                await fs.access(input_path);
            } catch (error) {
                return h.response({ error: 'File not found' }).code(404);
            }
            
            const readStream = fs.createReadStream(input_path);
            
            // Flag to prevent double deletion
            let deleted = false;
            
            const deleteFile = async () => {
                if (deleted) return;
                deleted = true;
                
                try {
                    await fs.unlink(input_path);
                    console.log(`Deleted file: ${input_path}`);
                    
                    // Also try to remove the directory if it's empty
                    const dirPath = path.dirname(input_path);
                    try {
                        await fs.rm(dirPath, { recursive: true });
                        console.log(`Removed empty directory: ${dirPath}`);
                    } catch (err) {
                        // Directory not empty or doesn't exist, that's fine
                        console.log(`Directory not empty: ${dirPath}`);
                    }
                } catch (error) {
                    console.error(`Failed to delete file ${input_path}:`, error.message);
                }
            };
            
            // Delete file when stream closes (after data has been sent)
            readStream.on('close', deleteFile);
            
            // Also delete on end (when all data has been read)
            readStream.on('end', deleteFile);
            
            // Handle stream errors - still delete the file
            readStream.on('error', async (error) => {
                console.error(`Stream error for ${input_path}:`, error.message);
                await deleteFile();
            });
            
            return h.response(readStream)
                .header('Content-Disposition', `attachment; filename=${request.params.file}`)
                .type('application/octet-stream');
        }
    });

    // ******* ROUTES ENDS ************

    await server.start();
    console.log('md-tesseract running on %s', server.info.uri);

    return server;
};

init().catch(err => {
    console.error(err);
    process.exit(1);
});



async function tesseractToText(filelist, options, out_path, outfile) {

    var result = {log: [], data: [], cli: '', exitcode: ''}
    for(const f of filelist) {
        const used = process.memoryUsage().heapUsed / 1024 / 1024;
        console.log(`The script uses approximately ${Math.round(used * 100) / 100} MB`);
        console.log('processing ' + f)
        console.log('output ' + out_path)
        //const text = await tesseract.recognize(f, options)
        try {
            console.log(options)
            await tesseract_spawn(f, options, out_path, outfile, result)
            await fs.writeFile(path.join(out_path, 'ocr.cli'), result.cli.join(' '), 'utf8')
            await fs.writeFile(path.join(out_path, 'ocr.log'), result.log.join(' '), 'utf8')
        } catch(e) {
            console.log(e)
            if(e.cli) await fs.writeFile(path.join(out_path, 'ocr.cli'), e.cli.join(' '), 'utf8')
            if(e.log) await fs.writeFile(path.join(out_path, 'ocr.log'), e.log.join(' '), 'utf8')
            throw(e)
        }
    }

    console.log('OCR done')
    return `${out_path.replace('data', '/files')}/${outfile}.txt`
}



async function tesseractToPDF(filelist, options, out_path, outfile) {
    console.log('pdf')
    var result = {log: [], data: [], cli: '', exitcode: ''}
    options.pdf = true
    try {
        console.log(options)
        await tesseract_spawn(filelist, options, out_path, outfile, result)
        await fs.writeFile(path.join(out_path, 'ocr.cli'), result.cli.join(' '), 'utf8')
        await fs.writeFile(path.join(out_path, 'ocr.log'), result.log.join('\n'), 'utf8')
    } catch(e) {
        if(e.cli) await fs.writeFile(path.join(out_path, 'ocr.cli'), e.cli.join(' '), 'utf8')
        if(e.log) await fs.writeFile(path.join(out_path, 'ocr.log'), e.log.join('\n'), 'utf8')
        throw(e)
    }
    console.log('OCR done')
    return `${out_path.replace('data', '/files')}/${outfile}.pdf`
}


async function tesseractToOSD(filelist, options, out_path, outfile) {

    var result = {log: [], data: [], cli: '', exitcode: ''}
    options.psm = 0
    try {
        console.log(options)
        console.log(outfile)
        await tesseract_spawn(filelist, options, out_path, outfile, result)
        await fs.writeFile(path.join(out_path, 'ocr.cli'), result.cli.join(' '), 'utf8')
        await fs.writeFile(path.join(out_path, 'ocr.log'), result.log.join('\n'), 'utf8')
    } catch(e) {
        if(e.cli) await fs.writeFile(path.join(out_path, 'ocr.cli'), e.cli.join(' '), 'utf8')
        if(e.log) await fs.writeFile(path.join(out_path, 'ocr.log'), e.log.join('\n'), 'utf8')
        throw(e)
    }
    console.log('Detection done')
    var json = await convert2JSON(path.join(out_path, outfile) + '.osd')
    fs.writeFile(path.join(out_path, outfile), JSON.stringify(json), 'utf8')
    return `${out_path.replace('data', '/files')}/${outfile}`
}

async function convert2JSON(file) {
    var json = {rotate:0, orientation:0, orientation_confidence:0, script_confidence:0, script: ''}
    var osd = await fs.readFile(file, 'utf-8')
    for(var line of osd.split('\n')) {
        if(line.includes('Rotate')) {
            json.rotate = parseInt(line.split(':')[1])
        }
        if(line.includes('Orientation in degrees')) {
            json.orientation = parseInt(line.split(':')[1])
        }
        if(line.includes('Orientation confidence')) {
            json.orientation_confidence = parseFloat(line.split(':')[1])
        }
        if(line.includes('Script confidence')) {
            json.script_confidence = parseFloat(line.split(':')[1])
        } else if(line.includes('Script')) {
            json.script = line.split(':')[1].trim()
        }
    }
    return json
}

async function tesseractToHOCR(filelist, options, out_path, outfile) {

    var result = {log: [], data: [], cli: '', exitcode: ''}
    options.hocr = true
    try {
        console.log(options)
        await tesseract_spawn(filelist, options, out_path, outfile, result)
        await fs.writeFile(path.join(out_path, 'ocr.cli'), result.cli.join(' '), 'utf8')
        await fs.writeFile(path.join(out_path, 'ocr.log'), result.log.join('\n'), 'utf8')
    } catch(e) {
        if(e.cli) await fs.writeFile(path.join(out_path, 'ocr.cli'), e.cli.join(' '), 'utf8')
        if(e.log) await fs.writeFile(path.join(out_path, 'ocr.log'), e.log.join('\n'), 'utf8')
        throw(e)
    }
    console.log('Detection done')
    return `${out_path.replace('data', '/files')}/${outfile}.hocr`
}

function tesseract_spawn(filelist, options, out_path, outfile, result) {
    var args = []
    if(options.c) {
        for(var parameter in options.c) {
            args.push('-c')
            args.push(`${parameter}=${options.c[parameter]}`)
        }
    }
    if(options.lang) {
        args.push('-l')
        args.push(options.lang)
    }

    if(Array.isArray(filelist)) args.push(path.join(out_path, 'files.txt'))
    else args.push(filelist)
    if(out_path) args.push(path.join(out_path, outfile))
    // output format
    if(options.pdf) args.push('pdf')
    else if(options.hocr) args.push('hocr')
    // orientation detection
    if(options.psm ===  0) {
        //args.push('-')
        args.push('--psm')
        args.push(0)
    }


    console.log(args)
    return new Promise((resolve, reject) => {
         var child = spawn('tesseract', args);
         console.log(child.spawnargs)
         result.cli = child.spawnargs

        child.stdout.setEncoding('utf8');
         child.stdout.on('data', function (data) {
             //console.log('stdout: ' + data);
            //result.log.push(child.spawnargs)
            result.data.push(data)
         });
        child.stderr.setEncoding('utf8');
         child.stderr.on('data', function (data) {
             console.log('stderr: ' + data);
            result.log.push(data)
         });
         child.on('close', function (code) {
             console.log('child process exited with code ' + code);
            result.log.push(code)
            result.exitcode = code
            resolve(result)
         });
        child.on('error', function (code) {
             console.log('child process errored with code ' + code);
            result.exitcode = code
            reject(result)
         });
     })
}

