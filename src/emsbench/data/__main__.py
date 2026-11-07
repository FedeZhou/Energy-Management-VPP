import argparse
import time

from emsbench.data import cache, load_library, prepare

parser = argparse.ArgumentParser(description="Download and process open data for emsbench.")
parser.add_argument("--refresh", action="store_true", help="rebuild processed profiles")
parser.add_argument("--only", nargs="*", help="limit to these sources")
args = parser.parse_args()

t = time.perf_counter()
for w in prepare(refresh=args.refresh, only=args.only):
    print("WARNING", w)
lib = load_library()
print(f"cache: {cache.ROOT}  ({time.perf_counter() - t:.1f}s)")
for kind, items in lib.catalogue().items():
    print(f"{kind:6s} {len(items):4d}  e.g. {items[0]['label'] if items else '-'}")
