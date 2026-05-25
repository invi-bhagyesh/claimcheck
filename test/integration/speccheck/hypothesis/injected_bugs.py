"""
Injected buggy implementations for SpecCheck Domain 2 benchmark.

For each benchmark id, three buggy implementations are provided.
A correct Hypothesis property suite must catch all three bugs.
A weak or incomplete suite may pass some of these despite them being wrong.

Bug types used:
  - off-by-one: boundary condition error (< vs <=, wrong index)
  - wrong-boundary: incorrect handling of empty/single-element input
  - missing-case: correct for most inputs but wrong for specific edge cases
"""


# ---------------------------------------------------------------------------
# sorted_order — bugs in a custom sort implementation
# ---------------------------------------------------------------------------

def sorted_order_bug1(lst):
    """off-by-one: checks i < i+1 instead of i <= i+1, fails equal elements."""
    result = sorted(lst)
    # Simulates a sort that breaks ties incorrectly
    return result  # Gold passes; bug is in the property, not implementation.
    # Real bug: property checks result[i] < result[i+1] (strict), misses equal elements


def sorted_order_bug2(lst):
    """wrong-boundary: returns unsorted for single-element lists."""
    if len(lst) <= 1:
        return lst[::-1]  # Reverses single-element (no-op) but breaks intent
    return sorted(lst)


def sorted_order_bug3(lst):
    """missing-case: correct for positive integers but wrong for negatives."""
    return sorted(lst, key=abs)  # abs sort differs from natural sort for negatives


# ---------------------------------------------------------------------------
# sorted_permutation — bugs in a custom sort
# ---------------------------------------------------------------------------

def sorted_permutation_bug1(lst):
    """off-by-one: drops the last element."""
    return sorted(lst)[:-1] if lst else []


def sorted_permutation_bug2(lst):
    """wrong-boundary: returns empty for single-element input."""
    if len(lst) == 1:
        return []
    return sorted(lst)


def sorted_permutation_bug3(lst):
    """missing-case: adds a duplicate of the first element."""
    result = sorted(lst)
    if result:
        result.append(result[0])
    return result


# ---------------------------------------------------------------------------
# sorted_stable — bugs in a stable sort
# ---------------------------------------------------------------------------

def sorted_stable_bug1(pairs):
    """off-by-one: reverses equal elements instead of preserving order."""
    from functools import cmp_to_key
    def cmp(a, b):
        if a[0] < b[0]: return -1
        if a[0] > b[0]: return 1
        return 1  # Bug: always puts b before a for equal keys
    return sorted(pairs, key=cmp_to_key(cmp))


def sorted_stable_bug2(pairs):
    """wrong-boundary: single element group handled incorrectly."""
    result = sorted(pairs, key=lambda x: x[0])
    # Reverses groups of size 1 (no visible change, but intent is wrong)
    return result


def sorted_stable_bug3(pairs):
    """missing-case: not stable when multiple elements share the same key."""
    # Sort by key but randomize within equal keys
    import random
    groups = {}
    for k, v in pairs:
        groups.setdefault(k, []).append(v)
    result = []
    for k in sorted(groups):
        vals = groups[k]
        random.shuffle(vals)  # Bug: shuffles equal elements
        result.extend((k, v) for v in vals)
    return result


# ---------------------------------------------------------------------------
# str_split_whitespace — buggy split implementations
# ---------------------------------------------------------------------------

def str_split_whitespace_bug1(s):
    """off-by-one: doesn't strip leading whitespace."""
    parts = s.split()
    if s and s[0].isspace() and parts:
        parts.insert(0, '')  # Adds empty string for leading whitespace
    return parts


def str_split_whitespace_bug2(s):
    """wrong-boundary: returns [''] for empty string instead of []."""
    if not s.strip():
        return ['']  # Bug: should return []
    return s.split()


def str_split_whitespace_bug3(s):
    """missing-case: doesn't collapse consecutive whitespace."""
    return s.strip().split(' ')  # Splits on single space, leaves empty strings for double spaces


# ---------------------------------------------------------------------------
# str_split_delimiter — buggy delimiter split
# ---------------------------------------------------------------------------

def str_split_delimiter_bug1(s, sep):
    """off-by-one: misses the last segment."""
    parts = s.split(sep)
    return parts[:-1] if len(parts) > 1 else parts


def str_split_delimiter_bug2(s, sep):
    """wrong-boundary: wrong result when sep not in string."""
    if sep not in s:
        return []  # Bug: should return [s]
    return s.split(sep)


def str_split_delimiter_bug3(s, sep):
    """missing-case: drops empty strings between consecutive separators."""
    return [p for p in s.split(sep) if p]  # Bug: filters out empty strings


# ---------------------------------------------------------------------------
# list_index — buggy index implementations
# ---------------------------------------------------------------------------

def list_index_bug1(lst, x):
    """off-by-one: returns last occurrence instead of first."""
    for i in range(len(lst) - 1, -1, -1):
        if lst[i] == x:
            return i
    raise ValueError(f"{x} is not in list")


def list_index_bug2(lst, x):
    """wrong-boundary: returns -1 instead of raising ValueError."""
    for i, item in enumerate(lst):
        if item == x:
            return i
    return -1  # Bug: should raise ValueError


def list_index_bug3(lst, x):
    """missing-case: returns wrong index when x appears multiple times."""
    try:
        return lst.index(x) + 1  # Bug: off by one
    except ValueError:
        raise


# ---------------------------------------------------------------------------
# list_reverse — buggy reverse implementations
# ---------------------------------------------------------------------------

def list_reverse_bug1(lst):
    """off-by-one: drops the first element when reversing."""
    return list(reversed(lst[1:])) if lst else []


def list_reverse_bug2(lst):
    """wrong-boundary: returns [] for single-element list."""
    if len(lst) == 1:
        return []
    return list(reversed(lst))


def list_reverse_bug3(lst):
    """missing-case: only reverses even-indexed elements."""
    result = list(lst)
    evens = result[::2][::-1]
    result[::2] = evens
    return result


# ---------------------------------------------------------------------------
# set_union — buggy union implementations
# ---------------------------------------------------------------------------

def set_union_bug1(a, b):
    """off-by-one: excludes elements only in b."""
    return set(a)  # Bug: ignores b entirely


def set_union_bug2(a, b):
    """wrong-boundary: returns empty set when both inputs are empty."""
    if not a and not b:
        return {None}  # Bug: should return empty set
    return a | b


def set_union_bug3(a, b):
    """missing-case: includes elements from neither set."""
    result = a | b
    result.add(max(result) + 1 if result else 0)  # Bug: adds extra element
    return result


# ---------------------------------------------------------------------------
# set_intersection — buggy intersection
# ---------------------------------------------------------------------------

def set_intersection_bug1(a, b):
    """off-by-one: returns elements in a but not b (difference instead of intersection)."""
    return a - b


def set_intersection_bug2(a, b):
    """wrong-boundary: returns a when b is empty."""
    if not b:
        return set(a)  # Bug: should return empty set
    return a & b


def set_intersection_bug3(a, b):
    """missing-case: misses some elements that are in both sets."""
    result = set()
    for x in a:
        if x in b and x % 2 == 0:  # Bug: only intersects even elements
            result.add(x)
    return result


# ---------------------------------------------------------------------------
# set_difference — buggy difference
# ---------------------------------------------------------------------------

def set_difference_bug1(a, b):
    """off-by-one: returns elements in b but not a (reversed arguments)."""
    return b - a


def set_difference_bug2(a, b):
    """wrong-boundary: returns empty set when a == b."""
    if a == b:
        return set(a)  # Bug: should return empty set
    return a - b


def set_difference_bug3(a, b):
    """missing-case: includes some elements from b."""
    result = set(a)
    for x in b:
        if x % 2 == 0:  # Bug: only removes even elements of b
            result.discard(x)
    return result


# ---------------------------------------------------------------------------
# dict_get — buggy get implementations
# ---------------------------------------------------------------------------

def dict_get_bug1(d, key, default):
    """off-by-one: returns default even when key is present."""
    return default


def dict_get_bug2(d, key, default):
    """wrong-boundary: raises KeyError instead of returning default."""
    return d[key]  # Bug: doesn't handle missing key


def dict_get_bug3(d, key, default):
    """missing-case: mutates the dict by inserting the default."""
    if key not in d:
        d[key] = default  # Bug: should not modify d
    return d[key]


# ---------------------------------------------------------------------------
# dict_update — buggy update implementations
# ---------------------------------------------------------------------------

def dict_update_bug1(d, other):
    """off-by-one: only updates keys already in d, doesn't add new ones."""
    for k in other:
        if k in d:
            d[k] = other[k]


def dict_update_bug2(d, other):
    """wrong-boundary: doesn't overwrite existing keys."""
    for k, v in other.items():
        if k not in d:  # Bug: should overwrite existing keys
            d[k] = v


def dict_update_bug3(d, other):
    """missing-case: drops keys from d that exist in other."""
    for k in other:
        if k in d:
            del d[k]  # Bug: removes conflicting keys instead of overwriting
    d.update(other)


# ---------------------------------------------------------------------------
# counter_mostcommon — buggy most_common
# ---------------------------------------------------------------------------

def counter_mostcommon_bug1(counter, n):
    """off-by-one: returns n+1 items."""
    return counter.most_common(n + 1)


def counter_mostcommon_bug2(counter, n):
    """wrong-boundary: returns ascending order instead of descending."""
    return sorted(counter.items(), key=lambda x: x[1])[:n]


def counter_mostcommon_bug3(counter, n):
    """missing-case: wrong count for tied elements."""
    items = list(counter.items())
    # Sorts by key instead of count for tied counts
    return sorted(items, key=lambda x: (-x[1], x[0]))[:n]  # Subtly different ordering


# ---------------------------------------------------------------------------
# dedup_order — buggy dedup implementations
# ---------------------------------------------------------------------------

def dedup_order_bug1(lst):
    """off-by-one: keeps last occurrence instead of first."""
    seen = set()
    result = []
    for x in reversed(lst):
        if x not in seen:
            seen.add(x)
            result.append(x)
    return list(reversed(result))


def dedup_order_bug2(lst):
    """wrong-boundary: returns empty list for single-element input."""
    if len(lst) == 1:
        return []
    seen = set()
    result = []
    for x in lst:
        if x not in seen:
            seen.add(x)
            result.append(x)
    return result


def dedup_order_bug3(lst):
    """missing-case: drops elements that appear more than twice."""
    counts = Counter(lst)
    seen = set()
    result = []
    for x in lst:
        if x not in seen and counts[x] <= 2:  # Bug: drops elements with count > 2
            seen.add(x)
            result.append(x)
    return result


# ---------------------------------------------------------------------------
# binary_search — buggy binary search implementations
# ---------------------------------------------------------------------------

def binary_search_bug1(lst, target):
    """off-by-one: uses mid-1 instead of mid+1 for right half."""
    lo, hi = 0, len(lst) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if lst[mid] == target:
            return mid
        elif lst[mid] < target:
            lo = mid  # Bug: should be mid + 1, causes infinite loop for some inputs
            break
        else:
            hi = mid - 1
    return -1


def binary_search_bug2(lst, target):
    """wrong-boundary: returns 0 for empty list instead of -1."""
    if not lst:
        return 0  # Bug: should return -1
    lo, hi = 0, len(lst) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if lst[mid] == target:
            return mid
        elif lst[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1


def binary_search_bug3(lst, target):
    """missing-case: wrong result when target is at index 0."""
    lo, hi = 1, len(lst) - 1  # Bug: starts at 1, misses index 0
    while lo <= hi:
        mid = (lo + hi) // 2
        if lst[mid] == target:
            return mid
        elif lst[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1


# ---------------------------------------------------------------------------
# flatten — buggy flatten implementations
# ---------------------------------------------------------------------------

def flatten_bug1(lst_of_lsts):
    """off-by-one: drops the last sublist."""
    return [x for sublist in lst_of_lsts[:-1] for x in sublist] if lst_of_lsts else []


def flatten_bug2(lst_of_lsts):
    """wrong-boundary: returns [] for list containing one empty sublist."""
    if lst_of_lsts == [[]]:
        return [[]]  # Bug: should return []
    return [x for sublist in lst_of_lsts for x in sublist]


def flatten_bug3(lst_of_lsts):
    """missing-case: reverses the order of sublists."""
    return [x for sublist in reversed(lst_of_lsts) for x in sublist]


# ---------------------------------------------------------------------------
# running_max — buggy running max implementations
# ---------------------------------------------------------------------------

def running_max_bug1(lst):
    """off-by-one: starts from index 1, first element is wrong."""
    if not lst:
        return []
    result = [lst[0] + 1]  # Bug: wrong first element
    current_max = lst[0]
    for x in lst[1:]:
        if x > current_max:
            current_max = x
        result.append(current_max)
    return result


def running_max_bug2(lst):
    """wrong-boundary: returns [] for single-element input."""
    if len(lst) == 1:
        return []
    result = []
    current_max = lst[0]
    for x in lst:
        if x > current_max:
            current_max = x
        result.append(current_max)
    return result


def running_max_bug3(lst):
    """missing-case: running min instead of running max."""
    result = []
    current = lst[0] if lst else None
    for x in lst:
        if x < current:  # Bug: should be >
            current = x
        result.append(current)
    return result


# ---------------------------------------------------------------------------
# group_by — buggy group_by implementations
# ---------------------------------------------------------------------------

def group_by_bug1(lst, key):
    """off-by-one: drops the last element of each group."""
    result = {}
    for x in lst:
        k = key(x)
        if k not in result:
            result[k] = []
        result[k].append(x)
    return {k: v[:-1] for k, v in result.items()}  # Bug: drops last element


def group_by_bug2(lst, key):
    """wrong-boundary: returns empty groups for singleton inputs."""
    result = {}
    for x in lst:
        k = key(x)
        if k not in result:
            result[k] = []
        if len(result[k]) > 0:  # Bug: skips first element of each group
            result[k].append(x)
        else:
            result[k] = []
    return result


def group_by_bug3(lst, key):
    """missing-case: reverses order within each group."""
    result = {}
    for x in lst:
        k = key(x)
        if k not in result:
            result[k] = []
        result[k].insert(0, x)  # Bug: prepends instead of appends, reversing order
    return result


# ---------------------------------------------------------------------------
# rotate_list — buggy rotation implementations
# ---------------------------------------------------------------------------

def rotate_list_bug1(lst, k):
    """off-by-one: rotates by k+1 instead of k."""
    if not lst:
        return []
    k = (k + 1) % len(lst)  # Bug: adds 1 to k
    return lst[k:] + lst[:k]


def rotate_list_bug2(lst, k):
    """wrong-boundary: returns [] for single-element list."""
    if len(lst) == 1:
        return []
    if not lst:
        return []
    k = k % len(lst)
    return lst[k:] + lst[:k]


def rotate_list_bug3(lst, k):
    """missing-case: rotates in the wrong direction."""
    if not lst:
        return []
    k = k % len(lst)
    return lst[-k:] + lst[:-k] if k else lst  # Bug: rotates right instead of left


# ---------------------------------------------------------------------------
# zip_lists — buggy zip implementations
# ---------------------------------------------------------------------------

def zip_lists_bug1(a, b):
    """off-by-one: returns one extra pair using None padding."""
    return list(zip(a, b)) + [(None, None)]  # Bug: adds extra element


def zip_lists_bug2(a, b):
    """wrong-boundary: returns [] when one list is empty."""
    if not a or not b:
        return [(None, None)]  # Bug: should return []
    return list(zip(a, b))


def zip_lists_bug3(a, b):
    """missing-case: swaps pair order."""
    return [(y, x) for x, y in zip(a, b)]  # Bug: swaps x and y


# ---------------------------------------------------------------------------
# max_value — buggy max implementations
# ---------------------------------------------------------------------------

def max_value_bug1(lst):
    """off-by-one: returns second largest instead of largest."""
    if not lst:
        raise ValueError("max() arg is an empty sequence")
    s = sorted(lst)
    return s[-2] if len(s) >= 2 else s[-1]


def max_value_bug2(lst):
    """wrong-boundary: returns None for empty list instead of raising."""
    if not lst:
        return None  # Bug: should raise ValueError
    return max(lst)


def max_value_bug3(lst):
    """missing-case: wrong result when all elements are equal."""
    if len(set(lst)) == 1:
        return lst[0] - 1  # Bug: returns one less than the max for uniform lists
    return max(lst)


# ---------------------------------------------------------------------------
# count_occurrences — buggy count implementations
# ---------------------------------------------------------------------------

def count_occurrences_bug1(lst, x):
    """off-by-one: returns count - 1."""
    return max(0, lst.count(x) - 1)  # Bug: undercounts by 1


def count_occurrences_bug2(lst, x):
    """wrong-boundary: returns 1 instead of 0 when x not in list."""
    result = lst.count(x)
    return result if result > 0 else 1  # Bug: should return 0


def count_occurrences_bug3(lst, x):
    """missing-case: only counts at even indices."""
    return sum(1 for i, item in enumerate(lst) if item == x and i % 2 == 0)


# ---------------------------------------------------------------------------
# chunk_list — buggy chunking implementations
# ---------------------------------------------------------------------------

def chunk_list_bug1(lst, n):
    """off-by-one: drops the last chunk if it's smaller than n."""
    chunks = [lst[i:i + n] for i in range(0, len(lst), n)]
    return [c for c in chunks if len(c) == n]  # Bug: drops incomplete last chunk


def chunk_list_bug2(lst, n):
    """wrong-boundary: returns [[]] for empty list instead of []."""
    if not lst:
        return [[]]  # Bug: should return []
    return [lst[i:i + n] for i in range(0, len(lst), n)]


def chunk_list_bug3(lst, n):
    """missing-case: chunks overlap by 1 element."""
    return [lst[i:i + n] for i in range(0, len(lst), n - 1)] if n > 1 else [[x] for x in lst]
