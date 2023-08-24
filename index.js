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
	ctx.body = 'md-cld API'
})

router.post('/process', upload.fields([
    { name: 'request', maxCount: 1 },
    { name: 'content', maxCount: 1 }
  ]), async function (ctx) {

    let output = {response: {
        type: "stored",
        uri: []
    }}
    console.log(ctx.request.files)
    const requestFilepath = ctx.request.files['request'][0].path
    const contentFilepath = ctx.request.files['content'][0].path

    try {
        var dirname = uuidv4()

        await fs.mkdir(path.join('data', dirname))
        var request = await fs.readFile(requestFilepath)
        var requestJSON = JSON.parse(request)
        console.log(requestJSON)
        const task = requestJSON.params.task
        delete requestJSON.params.task
    
        // if(task == 'text') {
        //     output.response.uri = await tesseractToText(contentFilepath, requestJSON.params, dirname)
        // } else if(task == 'searchable_pdf') {
        //     output.response.uri = await tesseractToPDF(contentFilepath, requestJSON.params, dirname)
        // } else if(task == 'alto') {
        //     output.response.uri = await tesseractToAlto(contentFilepath, requestJSON.params, dirname)
        // } else if(task == 'hocr') {
        //     output.response.uri = await tesseractToHOCR(contentFilepath, requestJSON.params, dirname)
        // }

       // await fs.unlink(contentFilepath)
      //  await fs.unlink(requestFilepath)

    } catch (e) {
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


// ******* ROUTES ENDS ************


app.use(router.routes());

var set_port = process.env.PORT || 8400
var server = app.listen(set_port, function () {
   var host = server.address().address
   var port = server.address().port

   console.log('md-cld running at http://%s:%s', host, port)
})



async function tesseract(params, options, url_path, query) {
    const file_id = params.fileid
    const command_path = `/ocr/${params.tesseract_command}`
    var p = url_path.split(file_id)[1]
    const input_path = path.join(ROOT, file_id, p.replace(command_path,''))
    const out_path =  path.join(ROOT, file_id, p + '/')
    if(!await this.exists(input_path)) throw(`Input path not found! (${input_path})`)
    var filelist = await this.getImageList(input_path, input_path, ALL_IMAGE_TYPES)
    if(filelist.length === 0) throw('No images found!')

    if(await this.exists(out_path)) throw(`Output directory exists (${out_path})`)

    try {
        await fsp.mkdir(out_path, { recursive: true })
        await fsp.writeFile(path.join(out_path, 'files.txt'), filelist.join('\n'), 'utf8')
    } catch(e) {
        throw('Could not create files.txt ' + e)
    }

    if(query.lang) {
        options.lang = query.lang
    }
    console.log(`tesseract options: ${JSON.stringify(options, null, 2)}`)
    if(params.tesseract_command === 'pdf') {
        options.pdf = true
         await this.tesseractToPDF(filelist, options, out_path, 'full')
    } else if(params.tesseract_command === 'textpdf') {
        options.pdf = true
        if(!options.c) options.c = {}
        options.c['textonly_pdf'] = 1
        await this.tesseractToPDF(filelist, options, out_path, 'ocr')
    } else if(params.tesseract_command === 'text') {
        await this.tesseractToText(filelist, options, out_path, '')
    } else if(params.tesseract_command === 'text+images') {
        if(!options.c) options.c = {}
        options.c['tessedit_write_images'] = 1
        await this.tesseractToText(filelist, options, out_path, '')
    }
}


async function tesseractToText(filelist, options, out_path, outfile) {

    var result = {log: [], data: [], cli: '', exitcode: ''}
    for(const f of filelist) {
        const used = process.memoryUsage().heapUsed / 1024 / 1024;
        console.log(`The script uses approximately ${Math.round(used * 100) / 100} MB`);
        console.log('processing ' + f)
        //const text = await tesseract.recognize(f, options)
        try {
            console.log(options)
            await this.tesseract_spawn(f, options, path.join(out_path, path.basename(f)), outfile, result)
            await fsp.writeFile(path.join(out_path, 'ocr.cli'), result.cli.join(' '), 'utf8')
            await fsp.writeFile(path.join(out_path, 'ocr.log'), result.log.join(' '), 'utf8')
        } catch(e) {
            console.log(e)
            await fsp.writeFile(path.join(out_path, 'ocr.cli'), e.cli.join(' '), 'utf8')
            await fsp.writeFile(path.join(out_path, 'ocr.log'), e.log.join(' '), 'utf8')
        }
        //await fsp.writeFile(path.join(out_path, path.basename(f) + '.txt'), text, 'utf8')
        //result.push(text)
    }
    // create fulltext.txt
    //result = result.map((x , index) => '\n\n--- ' + index + ' ---\n\n' + x )
    //await fsp.writeFile(path.join(out_path, 'fulltext.txt'), result.join(''), 'utf8')
    console.log('OCR done')
    return 'done'
}


async function tesseractToPDF(filelist, options, out_path, outfile) {
    var result = {log: [], data: [], cli: '', exitcode: ''}
    try {
        await this.tesseract_spawn(filelist, options, out_path, outfile, result)
        await fsp.writeFile(path.join(out_path, 'ocr.cli'), result.cli.join(' '), 'utf8')
        await fsp.writeFile(path.join(out_path, 'ocr.log'), result.log.join('\n'), 'utf8')
    } catch(e) {
        if(e.cli) await fsp.writeFile(path.join(out_path, 'ocr.cli'), e.cli.join(' '), 'utf8')
        if(e.log) await fsp.writeFile(path.join(out_path, 'ocr.log'), e.log.join('\n'), 'utf8')
        throw(e)
    }
    console.log('OCR done')
    return 'done'
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
    if(options.pdf) args.push('pdf')
    if(options.psm ===  0) {
        args.push('-')
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

async function detect(body) {
    if(!body || !body.content) return {}
    if(!body.params) {
        body.params = {}
    }

    const result = await cld.detect(body.content, body.params);
    return result
}

