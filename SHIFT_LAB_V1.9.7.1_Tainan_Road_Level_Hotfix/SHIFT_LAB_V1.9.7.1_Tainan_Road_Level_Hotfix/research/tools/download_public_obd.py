#!/usr/bin/env python3
"""Download original real ReV-StED data directly from its public GitHub source.
This script is used only when run on a network-enabled user's computer.
Do NOT repackage the raw recording into the commercial game.
"""
from __future__ import annotations
import argparse,hashlib,io,sys
from pathlib import Path
from urllib.request import Request,urlopen
import pandas as pd

URL='https://raw.githubusercontent.com/MB-Team-THI/UAHL-RevStED/main/OBD_Sample.csv'
BLOB_SHA='84189261768649e0c8eb0d62d474631ff401f3ea'

def run(folder:Path,force=False):
    folder.mkdir(parents=True,exist_ok=True)
    req=Request(URL,headers={'User-Agent':'SHIFT-LAB-Research-Fit/1.8.2'})
    with urlopen(req,timeout=35) as response:
        content=response.read(20_000_000)
    got=hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()
    if got!=BLOB_SHA and not force:
        raise RuntimeError(f'Original dataset changed: blob SHA {got}; expected {BLOB_SHA}. Use --allow-new-version only after manual review.')
    raw_path=folder/'OBD_Sample.csv';raw_path.write_bytes(content)
    sys.path.insert(0,str(Path(__file__).resolve().parent))
    from fit_real_obd import obtain_subset
    subset=obtain_subset(pd.read_csv(io.BytesIO(content)))
    path=folder/'obd_50hz_sample_decimated_10hz.csv';subset.to_csv(path,index=False)
    print(f'Git blob SHA {got}; download bytes {len(content)}; selected {len(subset)} authentic rows to {path}')
    return path

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'raw/obd')
    ap.add_argument('--allow-new-version',action='store_true')
    a=ap.parse_args();run(a.output,a.allow_new_version)
