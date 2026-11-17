"""Verify Arabic ONNX reading order on the studio-authored fixture, without installs."""
import hashlib
import json
import pathlib
import cv2
import numpy as np
import onnxruntime as ort

def main():
    ROOT = pathlib.Path(__file__).resolve().parents[3]
    BASE = ROOT / 'state/tmp/breakdown-artifacts'
    model = BASE / 'models/arabic_PP-OCRv4_rec_infer.onnx'
    session = ort.InferenceSession(str(model), providers=['CPUExecutionProvider'])
    metadata = session.get_modelmeta().custom_metadata_map
    characters = [''] + metadata['character'].splitlines() + [' ']
    truth = json.loads((ROOT / 'state/tmp/breakdown-evidence/truth.json').read_text(encoding='utf8'))
    results = []
    for index, (file, rect) in enumerate([('arabic.jpg',(130,750,400,835)),('boxed.jpg',(140,145,400,215))]):
        image_path = ROOT / 'state/tmp/breakdown-evidence' / file
        image = cv2.imread(str(image_path))
        if image is None:
            raise ValueError('Build and inspect the named synthetic fixture first.')
        x0,y0,x1,y1 = rect
        crop = image[y0:y1,x0:x1]
        width = min(320, int(np.ceil(crop.shape[1] / crop.shape[0] * 48)))
        resized = cv2.resize(crop,(width,48)).astype('float32').transpose(2,0,1) / 127.5 - 1
        tensor = np.zeros((1,3,48,320), dtype='float32')
        tensor[0,:,:,:width] = resized
        output = session.run(None,{session.get_inputs()[0].name:tensor})[0][0]
        sequence = output.argmax(axis=1)
        previous, words, scores = -1, [], []
        for timestep, token in enumerate(sequence):
            if token and token != previous:
                words.append(characters[token])
                scores.append(float(output[timestep,token]))
            previous = token
        text = ''.join(words)
        expected = truth['text'][index]['text']
        if text != expected:
            raise AssertionError(f'Arabic order/text mismatch: {text!r} != {expected!r}')
        results.append({'image':str(image_path),'imageSha256':hashlib.sha256(image_path.read_bytes()).hexdigest(),
                        'text':text,'expected':expected,'exact':True,'confidence':float(np.mean(scores))})
    receipt = {'schema':1,'method':'Existing local ONNX Runtime, own preprocessing and CTC decoder; RapidOCR integration remains pending installation.',
               'modelSha256':hashlib.sha256(model.read_bytes()).hexdigest(),'characterListEmbedded':True,
               'visualOrder':False,'orderVerified':True,'samples':results}
    (BASE / 'ocr-spike.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(receipt,ensure_ascii=False))


if __name__ == '__main__':
    main()
