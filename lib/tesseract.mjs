import { spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

export async function tesseractToText(filelist, options, out_path, outfile) {
    const result = { log: [], data: [], cli: '', exitcode: '' };
    for (const f of filelist) {
        const used = process.memoryUsage().heapUsed / 1024 / 1024;
        console.log(`The script uses approximately ${Math.round(used * 100) / 100} MB`);
        console.log('processing ' + f);
        console.log('output ' + out_path);

        try {
            console.log(options);
            await tesseractSpawn(f, options, out_path, outfile, result);
            await fs.writeFile(path.join(out_path, 'ocr.cli'), Array.isArray(result.cli) ? result.cli.join(' ') : result.cli, 'utf8');
            await fs.writeFile(path.join(out_path, 'ocr.log'), result.log.join(' '), 'utf8');
        } catch (e) {
            console.log(e);
            if (e.cli) await fs.writeFile(path.join(out_path, 'ocr.cli'), Array.isArray(e.cli) ? e.cli.join(' ') : e.cli, 'utf8');
            if (e.log) await fs.writeFile(path.join(out_path, 'ocr.log'), e.log.join(' '), 'utf8');
            throw e;
        }
    }

    console.log('OCR done');
    return `${out_path.replace('data', '/files')}/${outfile}.txt`;
}

export async function tesseractToPDF(filelist, options, out_path, outfile) {
    console.log('pdf');
    const result = { log: [], data: [], cli: '', exitcode: '' };
    options.pdf = true;
    try {
        console.log(options);
        await tesseractSpawn(filelist, options, out_path, outfile, result);
        await fs.writeFile(path.join(out_path, 'ocr.cli'), Array.isArray(result.cli) ? result.cli.join(' ') : result.cli, 'utf8');
        await fs.writeFile(path.join(out_path, 'ocr.log'), result.log.join('\n'), 'utf8');
    } catch (e) {
        if (e.cli) await fs.writeFile(path.join(out_path, 'ocr.cli'), Array.isArray(e.cli) ? e.cli.join(' ') : e.cli, 'utf8');
        if (e.log) await fs.writeFile(path.join(out_path, 'ocr.log'), e.log.join('\n'), 'utf8');
        throw e;
    }
    console.log('OCR done');
    return `${out_path.replace('data', '/files')}/${outfile}.pdf`;
}

export async function tesseractToOSD(filelist, options, out_path, outfile) {
    const result = { log: [], data: [], cli: '', exitcode: '' };
    options.psm = 0;
    try {
        console.log(options);
        console.log(outfile);
        await tesseractSpawn(filelist, options, out_path, outfile, result);
        await fs.writeFile(path.join(out_path, 'ocr.cli'), Array.isArray(result.cli) ? result.cli.join(' ') : result.cli, 'utf8');
        await fs.writeFile(path.join(out_path, 'ocr.log'), result.log.join('\n'), 'utf8');
    } catch (e) {
        if (e.cli) await fs.writeFile(path.join(out_path, 'ocr.cli'), Array.isArray(e.cli) ? e.cli.join(' ') : e.cli, 'utf8');
        if (e.log) await fs.writeFile(path.join(out_path, 'ocr.log'), e.log.join('\n'), 'utf8');
        throw e;
    }
    console.log('Detection done');
    const json = await convert2JSON(path.join(out_path, outfile) + '.osd');
    await fs.writeFile(path.join(out_path, outfile), JSON.stringify(json), 'utf8');
    return `${out_path.replace('data', '/files')}/${outfile}`;
}

export async function tesseractToHOCR(filelist, options, out_path, outfile) {
    const result = { log: [], data: [], cli: '', exitcode: '' };
    options.hocr = true;
    try {
        console.log(options);
        await tesseractSpawn(filelist, options, out_path, outfile, result);
        await fs.writeFile(path.join(out_path, 'ocr.cli'), Array.isArray(result.cli) ? result.cli.join(' ') : result.cli, 'utf8');
        await fs.writeFile(path.join(out_path, 'ocr.log'), result.log.join('\n'), 'utf8');
    } catch (e) {
        if (e.cli) await fs.writeFile(path.join(out_path, 'ocr.cli'), Array.isArray(e.cli) ? e.cli.join(' ') : e.cli, 'utf8');
        if (e.log) await fs.writeFile(path.join(out_path, 'ocr.log'), e.log.join('\n'), 'utf8');
        throw e;
    }
    console.log('Detection done');
    return `${out_path.replace('data', '/files')}/${outfile}.hocr`;
}

async function convert2JSON(file) {
    const json = { rotate: 0, orientation: 0, orientation_confidence: 0, script_confidence: 0, script: '' };
    const osd = await fs.readFile(file, 'utf-8');
    for (const line of osd.split('\n')) {
        if (line.includes('Rotate')) {
            json.rotate = parseInt(line.split(':')[1]);
        }
        if (line.includes('Orientation in degrees')) {
            json.orientation = parseInt(line.split(':')[1]);
        }
        if (line.includes('Orientation confidence')) {
            json.orientation_confidence = parseFloat(line.split(':')[1]);
        }
        if (line.includes('Script confidence')) {
            json.script_confidence = parseFloat(line.split(':')[1]);
        } else if (line.includes('Script')) {
            json.script = line.split(':')[1].trim();
        }
    }
    return json;
}

function tesseractSpawn(filelist, options, out_path, outfile, result) {
    const args = [];
    if (options.c) {
        for (const parameter in options.c) {
            args.push('-c');
            args.push(`${parameter}=${options.c[parameter]}`);
        }
    }
    if (options.lang) {
        args.push('-l');
        args.push(options.lang);
    }

    if (Array.isArray(filelist)) args.push(path.join(out_path, 'files.txt'));
    else args.push(filelist);

    if (out_path) args.push(path.join(out_path, outfile));

    // output format
    if (options.pdf) args.push('pdf');
    else if (options.hocr) args.push('hocr');

    // orientation detection
    if (options.psm === 0) {
        args.push('--psm');
        args.push('0');
    }

    console.log(args);
    return new Promise((resolve, reject) => {
        const child = spawn('tesseract', args);
        console.log(child.spawnargs);
        result.cli = child.spawnargs;

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', function (data) {
            result.data.push(data);
        });
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', function (data) {
            console.log('stderr: ' + data);
            result.log.push(data);
        });
        child.on('close', function (code) {
            console.log('child process exited with code ' + code);
            result.log.push(code);
            result.exitcode = code;
            if (code === 0) {
                resolve(result);
            } else {
                reject(result);
            }
        });
        child.on('error', function (code) {
            console.log('child process errored with code ' + code);
            result.exitcode = code;
            reject(result);
        });
    });
}
