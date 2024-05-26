import express from "express";
import formidable from "formidable";
import fs from "fs";
import { Essentia, EssentiaWASM } from "essentia.js";
import decode from 'audio-decode';
import cors from 'cors';
import jsmediatags from 'jsmediatags';

const app = express();
const PORT = 10000;

app.use(cors());

const essentia = new Essentia(EssentiaWASM);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// form data parsed for further analyzing
const parseForm = (form, req) => {
    return new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
            if (err) return reject(err);
            resolve({ fields, files });
        });
    });
};

// newly parsed data is digitally decoded and analyzed with the imported audio-decode and essentia library
const decodeAudio = async (filepath) => {
    try {
        const buffer = fs.readFileSync(filepath);
        const audio = await decode(buffer);
        const audioVector = essentia.arrayToVector(audio._channelData[0]);
        return audioVector;
    } catch(error) {
        console.error('Error reading or decoding audio:', error);
        throw new Error(error.message + ': Please select audio file with different format');
    }
};

//pulls the metadata from the audio file
const readAudioMetadata = (filepath) => {
    return new Promise((resolve, reject) => {
        new jsmediatags.Reader(filepath)
            .read({
                onSuccess: (tag) => {
                    console.log('Success!');
                    // console.log(tag);

                    const metaData = {
                        metaTitle: tag.tags.title,
                        metaArtist: tag.tags.artist,
                        metaAlbum: tag.tags.album,
                        metaGenre: tag.tags.genre,
                    };
                    try {
                        const data = tag.tags.picture.data;
                        const format = tag.tags.picture.format;

                        const base64Data = Buffer.from(data).toString('base64');
                            metaData.metaAlbumArt = `data:${format};base64,${base64Data}`;
                    } catch (error) {
                        console.error('No album artwork found in file', error);
                    }

                    resolve(metaData);
                },
                onError: (error) => {
                    console.log('Error reading audio file metadata', error);
                    reject(error);
                },
            });
    });
};

app.post("/analyze", async function (req, res) {
        const form = formidable();

        try {
            const { files } = await parseForm(form, req);

            const filepath = files.file[0].filepath;

            const metaData = await readAudioMetadata(filepath);

            const musicSpecs = await decodeAudio(filepath);

            const computedKey = essentia.KeyExtractor(musicSpecs);

            console.log(metaData.metaTitle, metaData.metaArtist, computedKey.key, computedKey.scale, essentia.PercivalBpmEstimator(musicSpecs).bpm)

            res.status(200).json({
                keySig: computedKey.key,
                mode: computedKey.scale,
                bpm: essentia.PercivalBpmEstimator(musicSpecs).bpm,
                metaData
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
});