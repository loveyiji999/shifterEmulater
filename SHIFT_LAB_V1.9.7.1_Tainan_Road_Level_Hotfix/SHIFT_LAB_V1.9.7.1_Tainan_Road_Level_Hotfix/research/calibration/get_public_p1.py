#!/usr/bin/env python3
"""User-initiated download of published Bucknell P1 MAT files.

Requires optional `pip install gdown` and network access. Original raw MAT
files remain outside the SHIFT//LAB redistribution archive. Do not bypass
provider access controls; if a link stops working, visit the institutional page.
"""
from __future__ import annotations
import argparse, hashlib, sys
from pathlib import Path
from fit_p1_real_runs import SOURCE_DATA

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--all',action='store_true',help='Fetch all six referenced test files')
    p.add_argument('--name',choices=sorted(SOURCE_DATA),help='Fetch a single named test')
    a=p.parse_args()
    if not (a.all or a.name):p.error('Supply --all or --name')
    try:import gdown
    except ImportError:sys.exit('Install the optional downloader: python -m pip install gdown')
    a.out.mkdir(parents=True,exist_ok=True)
    names=sorted(SOURCE_DATA) if a.all else [a.name]
    for n in names:
        source=SOURCE_DATA[n]; file=a.out/(n+'.mat')
        if not file.exists():
            url=f"https://drive.google.com/uc?id={source['file_id']}"
            print(f'Downloading published source {n}: {url}')
            result=gdown.download(id=source['file_id'],output=str(file),quiet=False)
            if not result:raise RuntimeError(f'Download failed: {n}; see Bucknell institutional data page')
        sha=hashlib.sha256(file.read_bytes()).hexdigest()
        if sha!=source['sha256']:
            file.unlink(missing_ok=True)
            raise RuntimeError(f'{n}: source hash mismatch, discarded unverified file; do not fit')
        print('VERIFIED',file.name,sha)

if __name__=='__main__':main()
