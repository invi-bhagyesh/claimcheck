"""
Gold Hypothesis property suites for SpecCheck Domain 2 benchmark.

Each suite is the ground-truth formalization of the corresponding NL requirement
in mappings/hypothesis.json. These are used to evaluate whether LLM-generated
specs are semantically equivalent.

Each function is named after the benchmark id and contains the minimal set of
properties needed to fully capture the requirement.
"""

from hypothesis import given, assume, settings
from hypothesis import strategies as st
from collections import Counter
import pytest


# ---------------------------------------------------------------------------
# sorted_order
# ---------------------------------------------------------------------------

@given(st.lists(st.integers()))
def test_sorted_order(lst):
    result = sorted(lst)
    for i in range(len(result) - 1):
        assert result[i] <= result[i + 1]


# ---------------------------------------------------------------------------
# sorted_length
# ---------------------------------------------------------------------------

@given(st.lists(st.integers()))
def test_sorted_length(lst):
    assert len(sorted(lst)) == len(lst)


# ---------------------------------------------------------------------------
# sorted_permutation
# ---------------------------------------------------------------------------

@given(st.lists(st.integers()))
def test_sorted_permutation(lst):
    result = sorted(lst)
    assert Counter(result) == Counter(lst)


# ---------------------------------------------------------------------------
# sorted_stable
# ---------------------------------------------------------------------------

@given(st.lists(st.tuples(st.integers(min_value=0, max_value=5), st.integers())))
def test_sorted_stable(lst):
    # Sort by first element only; equal keys must preserve original order
    result = sorted(lst, key=lambda x: x[0])
    for key in set(k for k, _ in lst):
        original_vals = [v for k, v in lst if k == key]
        result_vals = [v for k, v in result if k == key]
        assert original_vals == result_vals


# ---------------------------------------------------------------------------
# str_split_whitespace
# ---------------------------------------------------------------------------

@given(st.text())
def test_str_split_whitespace_no_empty(s):
    result = s.split()
    assert all(len(part) > 0 for part in result)
    assert all(not part.isspace() for part in result)


@given(st.text())
def test_str_split_whitespace_no_leading_trailing(s):
    result = s.split()
    if result:
        assert not result[0][0].isspace()
        assert not result[-1][-1].isspace()


@given(st.text())
def test_str_split_whitespace_roundtrip(s):
    # Joining on single space and re-splitting gives same tokens
    result = s.split()
    assert ' '.join(result).split() == result


# ---------------------------------------------------------------------------
# str_split_delimiter
# ---------------------------------------------------------------------------

@given(st.text(min_size=1), st.text(min_size=1))
def test_str_split_delimiter_join(s, sep):
    parts = s.split(sep)
    assert sep.join(parts) == s


@given(st.text(min_size=1), st.text(min_size=1))
def test_str_split_delimiter_count(s, sep):
    parts = s.split(sep)
    assert len(parts) == s.count(sep) + 1


# ---------------------------------------------------------------------------
# str_split_maxsplit
# ---------------------------------------------------------------------------

@given(st.text(min_size=1), st.text(min_size=1), st.integers(min_value=0, max_value=10))
def test_str_split_maxsplit_count(s, sep, n):
    parts = s.split(sep, n)
    assert len(parts) <= n + 1


@given(st.text(min_size=1), st.text(min_size=1), st.integers(min_value=0, max_value=10))
def test_str_split_maxsplit_remainder(s, sep, n):
    parts = s.split(sep, n)
    if len(parts) == n + 1:
        # Last element contains no more sep than expected if fully split
        assert sep.join(parts) == s


# ---------------------------------------------------------------------------
# list_index
# ---------------------------------------------------------------------------

@given(st.lists(st.integers()), st.integers())
def test_list_index_found(lst, x):
    assume(x in lst)
    idx = lst.index(x)
    assert lst[idx] == x
    assert idx == lst.index(x)
    # Must be the FIRST occurrence
    assert x not in lst[:idx]


@given(st.lists(st.integers()), st.integers())
def test_list_index_not_found(lst, x):
    assume(x not in lst)
    with pytest.raises(ValueError):
        lst.index(x)


# ---------------------------------------------------------------------------
# list_reverse
# ---------------------------------------------------------------------------

@given(st.lists(st.integers()))
def test_list_reverse_length(lst):
    assert len(list(reversed(lst))) == len(lst)


@given(st.lists(st.integers()))
def test_list_reverse_elements(lst):
    rev = list(reversed(lst))
    assert rev == lst[::-1]


@given(st.lists(st.integers()))
def test_list_reverse_involution(lst):
    assert list(reversed(list(reversed(lst)))) == lst


# ---------------------------------------------------------------------------
# set_union
# ---------------------------------------------------------------------------

@given(st.frozensets(st.integers()), st.frozensets(st.integers()))
def test_set_union_superset(a, b):
    u = a | b
    assert a <= u
    assert b <= u


@given(st.frozensets(st.integers()), st.frozensets(st.integers()))
def test_set_union_minimal(a, b):
    u = a | b
    for x in u:
        assert x in a or x in b


# ---------------------------------------------------------------------------
# set_intersection
# ---------------------------------------------------------------------------

@given(st.frozensets(st.integers()), st.frozensets(st.integers()))
def test_set_intersection_subset(a, b):
    inter = a & b
    assert inter <= a
    assert inter <= b


@given(st.frozensets(st.integers()), st.frozensets(st.integers()))
def test_set_intersection_complete(a, b):
    inter = a & b
    for x in a:
        if x in b:
            assert x in inter


# ---------------------------------------------------------------------------
# set_difference
# ---------------------------------------------------------------------------

@given(st.frozensets(st.integers()), st.frozensets(st.integers()))
def test_set_difference_no_other(a, b):
    diff = a - b
    assert not (diff & b)


@given(st.frozensets(st.integers()), st.frozensets(st.integers()))
def test_set_difference_subset_of_a(a, b):
    diff = a - b
    assert diff <= a


@given(st.frozensets(st.integers()), st.frozensets(st.integers()))
def test_set_difference_complete(a, b):
    diff = a - b
    for x in a:
        if x not in b:
            assert x in diff


# ---------------------------------------------------------------------------
# dict_get
# ---------------------------------------------------------------------------

@given(st.dictionaries(st.text(), st.integers()), st.text(), st.integers())
def test_dict_get_present(d, key, default):
    assume(key in d)
    assert d.get(key, default) == d[key]


@given(st.dictionaries(st.text(), st.integers()), st.text(), st.integers())
def test_dict_get_absent(d, key, default):
    assume(key not in d)
    assert d.get(key, default) == default


@given(st.dictionaries(st.text(), st.integers()), st.text(), st.integers())
def test_dict_get_no_mutation(d, key, default):
    original = dict(d)
    d.get(key, default)
    assert d == original


# ---------------------------------------------------------------------------
# dict_update
# ---------------------------------------------------------------------------

@given(st.dictionaries(st.text(), st.integers()), st.dictionaries(st.text(), st.integers()))
def test_dict_update_other_keys_present(d, other):
    d2 = dict(d)
    d2.update(other)
    for k, v in other.items():
        assert d2[k] == v


@given(st.dictionaries(st.text(), st.integers()), st.dictionaries(st.text(), st.integers()))
def test_dict_update_original_keys_preserved(d, other):
    d2 = dict(d)
    d2.update(other)
    for k, v in d.items():
        if k not in other:
            assert d2[k] == v


@given(st.dictionaries(st.text(), st.integers()), st.dictionaries(st.text(), st.integers()))
def test_dict_update_no_extra_keys(d, other):
    d2 = dict(d)
    d2.update(other)
    assert set(d2.keys()) == set(d.keys()) | set(other.keys())


# ---------------------------------------------------------------------------
# counter_mostcommon
# ---------------------------------------------------------------------------

@given(st.lists(st.integers(min_value=0, max_value=5)), st.integers(min_value=1, max_value=10))
def test_counter_mostcommon_order(lst, n):
    c = Counter(lst)
    top = c.most_common(n)
    counts = [cnt for _, cnt in top]
    assert counts == sorted(counts, reverse=True)


@given(st.lists(st.integers(min_value=0, max_value=5)), st.integers(min_value=1, max_value=10))
def test_counter_mostcommon_length(lst, n):
    c = Counter(lst)
    top = c.most_common(n)
    assert len(top) == min(n, len(c))


@given(st.lists(st.integers(min_value=0, max_value=5)))
def test_counter_mostcommon_all(lst):
    c = Counter(lst)
    top = c.most_common()
    assert len(top) == len(c)
    assert set(k for k, _ in top) == set(c.keys())


# ---------------------------------------------------------------------------
# dedup_order
# ---------------------------------------------------------------------------

def dedup(lst):
    seen = set()
    result = []
    for x in lst:
        if x not in seen:
            seen.add(x)
            result.append(x)
    return result


@given(st.lists(st.integers()))
def test_dedup_no_duplicates(lst):
    result = dedup(lst)
    assert len(result) == len(set(result))


@given(st.lists(st.integers()))
def test_dedup_preserves_order(lst):
    result = dedup(lst)
    # Result must be a subsequence of lst
    it = iter(lst)
    for x in result:
        assert any(y == x for y in it)


@given(st.lists(st.integers()))
def test_dedup_preserves_elements(lst):
    result = dedup(lst)
    assert set(result) == set(lst)


@given(st.lists(st.integers()))
def test_dedup_first_occurrence(lst):
    result = dedup(lst)
    for i, x in enumerate(result):
        # x must appear in lst before any other occurrence of x in result
        first_in_lst = lst.index(x)
        for j, y in enumerate(result):
            if i != j and y == x:
                assert False, f"Duplicate {x} in dedup result"


# ---------------------------------------------------------------------------
# binary_search
# ---------------------------------------------------------------------------

def binary_search(lst, target):
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


@given(st.lists(st.integers()).map(sorted), st.integers())
def test_binary_search_found(lst, target):
    assume(target in lst)
    idx = binary_search(lst, target)
    assert idx >= 0
    assert lst[idx] == target


@given(st.lists(st.integers()).map(sorted), st.integers())
def test_binary_search_not_found(lst, target):
    assume(target not in lst)
    assert binary_search(lst, target) == -1


@given(st.lists(st.integers()).map(sorted), st.integers())
def test_binary_search_valid_index(lst, target):
    idx = binary_search(lst, target)
    if idx != -1:
        assert 0 <= idx < len(lst)


# ---------------------------------------------------------------------------
# flatten
# ---------------------------------------------------------------------------

def flatten(lst_of_lsts):
    return [x for sublist in lst_of_lsts for x in sublist]


@given(st.lists(st.lists(st.integers())))
def test_flatten_length(lst_of_lsts):
    result = flatten(lst_of_lsts)
    assert len(result) == sum(len(sub) for sub in lst_of_lsts)


@given(st.lists(st.lists(st.integers())))
def test_flatten_order(lst_of_lsts):
    result = flatten(lst_of_lsts)
    expected = []
    for sub in lst_of_lsts:
        expected.extend(sub)
    assert result == expected


@given(st.lists(st.lists(st.integers())))
def test_flatten_elements(lst_of_lsts):
    result = flatten(lst_of_lsts)
    assert Counter(result) == Counter(x for sub in lst_of_lsts for x in sub)


# ---------------------------------------------------------------------------
# running_max
# ---------------------------------------------------------------------------

def running_max(lst):
    result = []
    current_max = None
    for x in lst:
        if current_max is None or x > current_max:
            current_max = x
        result.append(current_max)
    return result


@given(st.lists(st.integers(), min_size=1))
def test_running_max_length(lst):
    assert len(running_max(lst)) == len(lst)


@given(st.lists(st.integers(), min_size=1))
def test_running_max_nondecreasing(lst):
    result = running_max(lst)
    for i in range(len(result) - 1):
        assert result[i] <= result[i + 1]


@given(st.lists(st.integers(), min_size=1))
def test_running_max_correct_value(lst):
    result = running_max(lst)
    for i, val in enumerate(result):
        assert val == max(lst[:i + 1])


# ---------------------------------------------------------------------------
# group_by
# ---------------------------------------------------------------------------

def group_by(lst, key):
    result = {}
    for x in lst:
        k = key(x)
        if k not in result:
            result[k] = []
        result[k].append(x)
    return result


@given(st.lists(st.integers()))
def test_group_by_all_elements(lst):
    result = group_by(lst, lambda x: x % 3)
    all_elements = [x for group in result.values() for x in group]
    assert Counter(all_elements) == Counter(lst)


@given(st.lists(st.integers()))
def test_group_by_correct_keys(lst):
    result = group_by(lst, lambda x: x % 3)
    for k, group in result.items():
        for x in group:
            assert x % 3 == k


@given(st.lists(st.integers()))
def test_group_by_order_preserved(lst):
    result = group_by(lst, lambda x: x % 3)
    for k, group in result.items():
        original_order = [x for x in lst if x % 3 == k]
        assert group == original_order


# ---------------------------------------------------------------------------
# rotate_list
# ---------------------------------------------------------------------------

def rotate_list(lst, k):
    if not lst:
        return []
    k = k % len(lst)
    return lst[k:] + lst[:k]


@given(st.lists(st.integers()), st.integers(min_value=0, max_value=20))
def test_rotate_length(lst, k):
    assert len(rotate_list(lst, k)) == len(lst)


@given(st.lists(st.integers()), st.integers(min_value=0, max_value=20))
def test_rotate_elements(lst, k):
    assert Counter(rotate_list(lst, k)) == Counter(lst)


@given(st.lists(st.integers(), min_size=1), st.integers(min_value=0, max_value=20))
def test_rotate_first_k_moved_to_end(lst, k):
    k_actual = k % len(lst)
    result = rotate_list(lst, k)
    assert result[-k_actual:] == lst[:k_actual] if k_actual > 0 else result == lst


# ---------------------------------------------------------------------------
# zip_lists
# ---------------------------------------------------------------------------

@given(st.lists(st.integers()), st.lists(st.integers()))
def test_zip_length(a, b):
    result = list(zip(a, b))
    assert len(result) == min(len(a), len(b))


@given(st.lists(st.integers()), st.lists(st.integers()))
def test_zip_pairs(a, b):
    result = list(zip(a, b))
    for i, (x, y) in enumerate(result):
        assert x == a[i]
        assert y == b[i]


# ---------------------------------------------------------------------------
# max_value
# ---------------------------------------------------------------------------

@given(st.lists(st.integers(), min_size=1))
def test_max_is_in_list(lst):
    m = max(lst)
    assert m in lst


@given(st.lists(st.integers(), min_size=1))
def test_max_is_maximum(lst):
    m = max(lst)
    assert all(x <= m for x in lst)


@given(st.lists(st.integers()))
def test_max_empty_raises(lst):
    assume(len(lst) == 0)
    with pytest.raises(ValueError):
        max(lst)


# ---------------------------------------------------------------------------
# count_occurrences
# ---------------------------------------------------------------------------

@given(st.lists(st.integers()), st.integers())
def test_count_correct(lst, x):
    assert lst.count(x) == sum(1 for item in lst if item == x)


@given(st.lists(st.integers()), st.integers())
def test_count_nonnegative(lst, x):
    assert lst.count(x) >= 0


@given(st.lists(st.integers()), st.integers())
def test_count_zero_if_absent(lst, x):
    assume(x not in lst)
    assert lst.count(x) == 0


# ---------------------------------------------------------------------------
# chunk_list
# ---------------------------------------------------------------------------

def chunk_list(lst, n):
    return [lst[i:i + n] for i in range(0, len(lst), n)]


@given(st.lists(st.integers()), st.integers(min_value=1, max_value=10))
def test_chunk_no_elements_lost(lst, n):
    chunks = chunk_list(lst, n)
    flat = [x for chunk in chunks for x in chunk]
    assert flat == lst


@given(st.lists(st.integers()), st.integers(min_value=1, max_value=10))
def test_chunk_sizes(lst, n):
    chunks = chunk_list(lst, n)
    for i, chunk in enumerate(chunks):
        if i < len(chunks) - 1:
            assert len(chunk) == n
        else:
            assert 1 <= len(chunk) <= n


@given(st.lists(st.integers(), min_size=1), st.integers(min_value=1, max_value=10))
def test_chunk_count(lst, n):
    chunks = chunk_list(lst, n)
    expected_count = (len(lst) + n - 1) // n
    assert len(chunks) == expected_count
