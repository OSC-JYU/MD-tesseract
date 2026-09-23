import Joi from 'joi';
import formidable from 'formidable';
import fs from 'fs-extra';
import path from 'path';
import { tesseractToText, tesseractToPDF, tesseractToHOCR, tesseractToOSD } from './tesseract.mjs';
import { createServiceRegistrationRoutes } from './service_registration.mjs';

const SERVICE_ID = process.env.SERVICE_ID || 'md-tesseract';

export const routes = [
    {
        method: 'GET',
        path: '/',
        handler: (request, h) => {
            return 'md-tesseract API';
        }
    },
    {
        method: 'POST',
        path: '/process',
        options: {
            payload: {
                output: 'stream',
                parse: false,
                maxBytes: 52428800,
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
                maxFileSize: 52428800
            });

            const { fields, files: filesParsed } = await new Promise((resolve, reject) => {
                form.parse(request.payload, (err, fields, filesParsed) => {
                    if (err) return reject(err);
                    resolve({ fields, files: filesParsed });
                });
            });

            console.log('Files received:', Object.keys(filesParsed));

            const getFilePath = (file) => {
                if (!file) return null;
                if (Array.isArray(file)) {
                    return file[0]?.filepath || file[0]?.path || null;
                }
                return file.filepath || file.path || null;
            };

            let messageFile = filesParsed.message || filesParsed.request;
            let contentFile = filesParsed.content;

            if (!messageFile || !contentFile) {
                console.error('Missing files. Available fields:', Object.keys(filesParsed));
                return h.response({ error: 'Missing required files', availableFields: Object.keys(filesParsed) }).code(400);
            }

            const messageFilepath = getFilePath(messageFile);
            const contentFilepath = getFilePath(contentFile);

            if (!messageFilepath || !contentFilepath) {
                return h.response({ error: 'Could not determine file paths', messageFilepath, contentFilepath }).code(400);
            }

            try {
                const filename = path.basename(contentFilepath);
                const dirname = path.join('data', filename);
                await fs.mkdir(dirname, { recursive: true });
                console.log('dirname', dirname);

                let messageJSON;
                try {
                    messageJSON = await fs.readJSON(messageFilepath);
                } catch (parseError) {
                    const messageText = await fs.readFile(messageFilepath, 'utf-8');
                    messageJSON = JSON.parse(messageText);
                }

                if (typeof messageJSON === 'string') {
                    messageJSON = JSON.parse(messageJSON);
                }

                // Validate message structure using Joi
                const schema = Joi.object({
                    task: Joi.object({
                        id: Joi.string().required().valid('image2text', 'searchable_pdf', 'image2hocr', 'orientation_detection'),
                        params: Joi.object().optional().default({})
                    }).required(),
                    file: Joi.any().optional()
                }).unknown(true);

                // const { error, value } = schema.validate(messageJSON);
                // if (error) {
                //     throw new Error(`Invalid message format: ${error.message}`);
                // }
                // messageJSON = value;

                const task = messageJSON.task.id;

                if (Array.isArray(messageJSON.task.params['lang'])) {
                    messageJSON.task.params['lang'] = messageJSON.task.params['lang'].join('+');
                }

                console.log('task', task);
                console.log('messageJSON.file', messageJSON.file);
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
                    // We might want to keep the directory for debugging if it failed, or remove it.
                    // The original code removed it.
                    // await fs.rm(dirname, { recursive: true }); 
                } catch (e) {
                    console.log('Removing of temp files failed');
                }
                return h.response({ error: e.message }).code(500);
            }

            return output;
        }
    },
    {
        method: 'GET',
        path: '/files/{dir}/{file}',
        handler: async (request, h) => {
            const input_path = path.join('data', request.params.dir, request.params.file);

            try {
                await fs.access(input_path);
            } catch (error) {
                return h.response({ error: 'File not found' }).code(404);
            }

            const readStream = fs.createReadStream(input_path);
            let deleted = false;

            const deleteFile = async () => {
                if (deleted) return;
                deleted = true;

                try {
                    await fs.unlink(input_path);
                    console.log(`Deleted file: ${input_path}`);
                    const dirPath = path.dirname(input_path);
                    try {
                        await fs.rm(dirPath, { recursive: true });
                        console.log(`Removed empty directory: ${dirPath}`);
                    } catch (err) {
                        console.log(`Directory not empty: ${dirPath}`);
                    }
                } catch (error) {
                    console.error(`Failed to delete file ${input_path}:`, error.message);
                }
            };

            readStream.on('close', deleteFile);
            readStream.on('end', deleteFile);
            readStream.on('error', async (error) => {
                console.error(`Stream error for ${input_path}:`, error.message);
                await deleteFile();
            });

            return h.response(readStream)
                .header('Content-Disposition', `attachment; filename=${request.params.file}`)
                .type('application/octet-stream');
        }
    },
    ...createServiceRegistrationRoutes({
        serviceId: SERVICE_ID
    })
];
