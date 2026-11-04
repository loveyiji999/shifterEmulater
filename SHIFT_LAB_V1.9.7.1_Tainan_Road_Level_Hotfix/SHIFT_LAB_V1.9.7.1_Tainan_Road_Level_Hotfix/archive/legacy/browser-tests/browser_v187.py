"""Compatibility command for older v1.8.7 browser QA documentation.

All real-browser test coverage now lives in browser_v1892.py and uses the
single-page modes instead of clicking an invisible #drive-now button.
"""
from browser_v1892 import main

if __name__ == '__main__':
    main()
