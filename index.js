const Koa			= require('koa');
const Router		= require('koa-router');
const { koaBody }	= require('koa-body');
const json			= require('koa-json')
const multer 		= require('@koa/multer');
const fs 			= require('fs-extra')
const { v4: uuidv4 } = require('uuid');
const path 			= require('path')



var app				= new Koa();
var router			= new Router();

app.use(json({ pretty: true, param: 'pretty' }))
app.use(koaBody());

const upload = multer({
	dest: './uploads/',
	fileSize: 1048576
});


// ******* ROUTES ************

router.get('/', function (ctx) {
	ctx.body = 'md-tesseract API'
})

router.post('/process', upload.fields([
    { name: 'request', maxCount: 1 },
    { name: 'content', maxCount: 1 }
  ]), async function (ctx) {

    let output = {response: {
        type: "stored",
        uri: []
    }}
    const requestFilepath = ctx.request.files['request'][0].path
    const contentFilepath = ctx.request.files['content'][0].path

    try {
        const dirname = contentFilepath.replace('uploads/', 'data/')
        await fs.mkdir(dirname)

        var requestFile = await fs.readJSON(requestFilepath, 'utf8')
        var requestJSON = JSON.parse(requestFile)
        console.log(requestJSON)
        console.log(requestJSON.id)
        console.log(requestJSON.params)
        const task = requestJSON.params.task
        delete requestJSON.params.task
    
        if(task == 'image2text') {
            output.response.uri = await tesseractToText([contentFilepath], requestJSON.params, dirname, 'text')
        } else if(task == 'searchable_pdf') {
            output.response.uri = await tesseractToPDF(contentFilepath, requestJSON.params, dirname, "file")
        } else if(task == 'image2hocr') {
            output.response.uri = await tesseractToHOCR(contentFilepath, requestJSON.params, dirname, 'text.hocr')
        } else if(task == 'orientation_detection') {
            output.response.uri = await tesseractToOSD(contentFilepath, requestJSON.params, dirname, "orientation.json")
        }

       await fs.unlink(contentFilepath)
       await fs.unlink(requestFilepath)

    } catch (e) {
        console.log(e)
        console.log(e.message)
        try {
            await fs.unlink(contentFilepath)
            await fs.unlink(requestFilepath)
        } catch(e) {
            console.log('Removing of temp files failed')
        }

    }
	ctx.body = output
})



router.get('/files/:dir/:file', async function (ctx) {
    var input_path = path.join('data', ctx.request.params.dir, ctx.request.params.file)
    const src = fs.createReadStream(input_path);
    ctx.set('Content-Disposition', `attachment; filename=${ctx.request.params.file}`);
    ctx.type = 'application/octet-stream';
    ctx.body = src
})


// ******* ROUTES ENDS ************


app.use(router.routes());

var set_port = process.env.PORT || 8400
var server = app.listen(set_port, function () {
   var host = server.address().address
   var port = server.address().port

   console.log('md-tesseract running at http://%s:%s', host, port)
})



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
        await tesseract_spawn(filelist, options, out_path, outfile, result)
        await fs.writeFile(path.join(out_path, 'ocr.cli'), result.cli.join(' '), 'utf8')
        await fs.writeFile(path.join(out_path, 'ocr.log'), result.log.join('\n'), 'utf8')
    } catch(e) {
        if(e.cli) await fs.writeFile(path.join(out_path, 'ocr.cli'), e.cli.join(' '), 'utf8')
        if(e.log) await fs.writeFile(path.join(out_path, 'ocr.log'), e.log.join('\n'), 'utf8')
        throw(e)
    }
    console.log('Detection done')
    return `${out_path.replace('data', '/files')}/${outfile}.osd`
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
    const spawn = require("child_process").spawn
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
