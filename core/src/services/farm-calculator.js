const fs = require('node:fs');
const path = require('node:path');

function loadJson(name) {
    const devPath = path.join(__dirname, '../../../web/public/nc_local_version/data', name);
    const prodPath = path.join(__dirname, '../../../web/dist/nc_local_version/data', name);
    if (fs.existsSync(prodPath)) return JSON.parse(fs.readFileSync(prodPath, 'utf8'));
    if (fs.existsSync(devPath)) return JSON.parse(fs.readFileSync(devPath, 'utf8'));
    return null;
}

let CROPS_DATA = null;
let LANDS_DATA = null;
let EXP_TABLE = null;

function ensureData() {
    if (!CROPS_DATA) CROPS_DATA = loadJson('crops.json') || { crops: [] };
    if (!LANDS_DATA) LANDS_DATA = loadJson('lands.json') || {};
    if (!EXP_TABLE) EXP_TABLE = loadJson('exp_table.json') || [];
}

const LAND_BONUSES = {
    1: { yield: 0.0, timeReduce: 0.0, expBonus: 0.0 },
    2: { yield: 1.0, timeReduce: 0.0, expBonus: 0.0 },
    3: { yield: 2.0, timeReduce: 0.10, expBonus: 0.0 },
    4: { yield: 3.0, timeReduce: 0.20, expBonus: 0.20 },
};

const PLANT_SPEED_NO_FERT = 9;
const PLANT_SPEED_FERT = 6;
const FERT_ACTION_PER_LAND = 0.1;

function calculate_time_crops() {
    ensureData();
    return CROPS_DATA;
}

function calculate_lands_for_level(level) {
    ensureData();
    return LANDS_DATA[String(level)] || LANDS_DATA['1'] || { lands: 6, distribution: { 1: 6 } };
}

function format_time(seconds) {
    let s = Math.max(1, Math.round(seconds));
    if (s < 60) return `${s}秒`;
    let m = Math.floor(s / 60);
    s = s % 60;
    if (m < 60) return s > 0 ? `${m}分${s}秒` : `${m}分钟`;
    const h = Math.floor(m / 60);
    m = m % 60;
    return m > 0 ? `${h}小时${m}分` : `${h}小时`;
}

function get_crop_stats(crop, params, land_dist, lands, min_land_level, is_smart_fert, is_ideal, is_s2_fert) {
    const time_reduce_pct = LAND_BONUSES[min_land_level].timeReduce;
    const valid_phases = crop.phases.filter(p => p.seconds > 0);
    const phase_count = valid_phases.length;

    const phase_details = valid_phases.map(p => ({
        name: p.name,
        seconds: p.seconds,
        img: p.img || ''
    }));

    const phase_secs_adjusted = valid_phases.map(p => Math.max(1, Math.round(p.seconds * (1 - time_reduce_pct))));
    const total_grow_sec = phase_secs_adjusted.reduce((a, b) => a + b, 0);

    const seasons = crop.seasons || 1;
    const is_two_season = seasons > 1;

    let second_season_grow_sec = 0;
    let full_cycle_grow_sec = total_grow_sec;
    let two_season_diff = false;

    if (is_two_season && phase_count >= 2) {
        const s2_phases = phase_secs_adjusted.slice(-2);
        second_season_grow_sec = s2_phases.reduce((a, b) => a + b, 0);
        full_cycle_grow_sec = total_grow_sec + second_season_grow_sec;
        two_season_diff = true;
    }

    const fert_phases_all_same = phase_count > 1 && new Set(valid_phases.map(p => p.seconds)).size === 1;

    let fert_best_phase_sec = 0; let fert_best_phase_names = []; let fert_best_phase_orders = [];
    if (is_smart_fert) {
        if (phase_secs_adjusted.length > 0) {
            const max_phase_sec = Math.max(...phase_secs_adjusted);
            const max_phase_idx = phase_secs_adjusted.indexOf(max_phase_sec);
            fert_best_phase_sec = max_phase_sec;
            fert_best_phase_names = [valid_phases[max_phase_idx].name];
            fert_best_phase_orders = [max_phase_idx + 1];
        }
    } else {
        if (phase_secs_adjusted.length > 0) {
            fert_best_phase_sec = phase_secs_adjusted[0];
            fert_best_phase_names = [valid_phases[0].name];
            fert_best_phase_orders = [1];
        }
    }

    const grow_time_fert = Math.max(1, total_grow_sec - fert_best_phase_sec);
    let second_season_grow_fert_sec = second_season_grow_sec;
    let second_season_fert_active = false;

    if (is_two_season && two_season_diff && is_s2_fert && phase_secs_adjusted.length >= 2) {
        const s2_phases_adj = phase_secs_adjusted.slice(-2);
        const s2_max = Math.max(...s2_phases_adj);
        second_season_grow_fert_sec = Math.max(1, second_season_grow_sec - s2_max);
        second_season_fert_active = true;
    }

    const full_cycle_grow_fert_sec = two_season_diff ? grow_time_fert + second_season_grow_sec : grow_time_fert;
    const full_cycle_grow_fert_with_s2_sec = two_season_diff ? grow_time_fert + (second_season_fert_active ? second_season_grow_fert_sec : second_season_grow_sec) : grow_time_fert;

    const base_exp = crop.exp;
    let total_exp = 0;
    [4, 3, 2, 1].forEach(lv => {
        const cnt = land_dist[lv] || 0;
        if (cnt > 0) total_exp += cnt * base_exp * (1 + LAND_BONUSES[lv].expBonus);
    });
    total_exp = Math.round(total_exp);
    const exp_per_cycle = two_season_diff ? total_exp * 2 : total_exp;

    const base_fruit_count = crop.fruitCount || 0;
    const fruit_sell_price = crop.fruitSellPrice || 0;
    let total_gold = 0; let effective_fruit_count = 0;
    [4, 3, 2, 1].forEach(lv => {
        const cnt = land_dist[lv] || 0;
        if (cnt > 0) {
            const fruit_for_this = Math.round(base_fruit_count * (1 + LAND_BONUSES[lv].yield));
            effective_fruit_count += fruit_for_this * cnt;
            total_gold += fruit_for_this * fruit_sell_price * cnt;
        }
    });
    total_gold = Math.round(total_gold);
    const effective_fruit_per_land = lands > 0 ? Math.round(effective_fruit_count / lands) : base_fruit_count;
    const gold_per_cycle = two_season_diff ? total_gold * 2 : total_gold;

    const plant_sec_no_fert = lands / PLANT_SPEED_NO_FERT;
    const plant_sec_fert = lands / PLANT_SPEED_FERT;
    const fert_action_sec = lands * FERT_ACTION_PER_LAND;

    let cycle_no_fert, cycle_fert;
    if (is_ideal) {
        cycle_no_fert = two_season_diff ? full_cycle_grow_sec : total_grow_sec;
        cycle_fert = two_season_diff ? full_cycle_grow_fert_with_s2_sec : grow_time_fert;
    } else {
        if (two_season_diff) {
            cycle_no_fert = full_cycle_grow_sec + plant_sec_no_fert;
            cycle_fert = full_cycle_grow_fert_with_s2_sec + plant_sec_fert + (second_season_fert_active ? fert_action_sec * 2 : fert_action_sec);
        } else {
            cycle_no_fert = total_grow_sec + plant_sec_no_fert;
            cycle_fert = grow_time_fert + plant_sec_fert + fert_action_sec;
        }
    }

    cycle_no_fert = Math.max(1, cycle_no_fert);
    cycle_fert = Math.max(1, cycle_fert);

    const exp_per_hour_no_fert = +(exp_per_cycle / (cycle_no_fert / 3600)).toFixed(2);
    const exp_per_hour_fert = +(exp_per_cycle / (cycle_fert / 3600)).toFixed(2);
    const gold_per_hour_no_fert = +(gold_per_cycle / (cycle_no_fert / 3600)).toFixed(2);
    const gold_per_hour_fert = +(gold_per_cycle / (cycle_fert / 3600)).toFixed(2);

    const exp_per_day_no_fert = exp_per_hour_no_fert * 24;
    const exp_per_day_fert = exp_per_hour_fert * 24;
    const gold_per_day_no_fert = gold_per_hour_no_fert * 24;
    const gold_per_day_fert = gold_per_hour_fert * 24;

    const gain_percent = exp_per_hour_no_fert > 0 ? ((exp_per_hour_fert - exp_per_hour_no_fert) / exp_per_hour_no_fert * 100) : 0;
    const gold_gain_percent = gold_per_hour_no_fert > 0 ? ((gold_per_hour_fert - gold_per_hour_no_fert) / gold_per_hour_no_fert * 100) : 0;

    const thumb = crop.phases && crop.phases[0] && crop.phases[0].img ? crop.phases[0].img : '';

    return {
        name: crop.name,
        seedId: crop.seed_id,
        requiredLevel: crop.level,
        price: crop.price || 0,
        exp: base_exp,
        fruitCount: base_fruit_count,
        fruitSellPrice: fruit_sell_price,
        effectiveFruitCount: effective_fruit_per_land,
        thumb,
        phaseCount: phase_count,
        phaseDetails: phase_details,
        isTwoSeason: is_two_season,
        twoSeasonDiff: two_season_diff,
        growTimeSec: total_grow_sec,
        growTimeStr: format_time(total_grow_sec),
        growTimeFert: grow_time_fert,
        growTimeFertStr: format_time(grow_time_fert),
        secondSeasonGrowSec: second_season_grow_sec,
        secondSeasonGrowStr: second_season_grow_sec > 0 ? format_time(second_season_grow_sec) : "",
        secondSeasonGrowFertSec: second_season_grow_fert_sec,
        secondSeasonGrowFertStr: second_season_grow_fert_sec > 0 ? format_time(second_season_grow_fert_sec) : "",
        secondSeasonFertActive: second_season_fert_active,
        fullCycleGrowSec: full_cycle_grow_sec,
        fullCycleGrowStr: format_time(full_cycle_grow_sec),
        fullCycleGrowFertSec: full_cycle_grow_fert_sec,
        fullCycleGrowFertStr: format_time(full_cycle_grow_fert_sec),
        fullCycleGrowFertWithS2Sec: full_cycle_grow_fert_with_s2_sec,
        fullCycleGrowFertWithS2Str: format_time(full_cycle_grow_fert_with_s2_sec),
        cycleNoFert: +cycle_no_fert.toFixed(4),
        cycleFert: +cycle_fert.toFixed(4),
        expPerCycle: exp_per_cycle,
        goldPerCycle: gold_per_cycle,
        expPerHourNoFert: exp_per_hour_no_fert,
        expPerHourFert: exp_per_hour_fert,
        goldPerHourNoFert: gold_per_hour_no_fert,
        goldPerHourFert: gold_per_hour_fert,
        expPerDayNoFert: exp_per_day_no_fert,
        expPerDayFert: exp_per_day_fert,
        goldPerDayNoFert: gold_per_day_no_fert,
        goldPerDayFert: gold_per_day_fert,
        gainPercent: +gain_percent.toFixed(4),
        goldGainPercent: +gold_gain_percent.toFixed(4),
        fertBestPhaseNames: fert_best_phase_names,
        fertBestPhaseOrders: fert_best_phase_orders,
        fertBestPhaseSec: fert_best_phase_sec,
        fertPhasesAllSame: fert_phases_all_same,
    };
}

function calculate_main(params) {
    ensureData();
    const level = Number.parseInt(params.level || '1', 10);
    const is_smart_fert = params.smart === '1';
    const is_ideal = params.ideal === '1';
    const is_s2_fert = params.s2fert === '1';

    const lands_info = calculate_lands_for_level(level);
    let lands = lands_info.lands;
    const default_dist = lands_info.distribution || {};

    const gold = Number.parseInt(params.gold || '0', 10);
    const black = Number.parseInt(params.black || '0', 10);
    const red = Number.parseInt(params.red || '0', 10);
    const normal = Number.parseInt(params.normal || '0', 10);

    let land_dist = {};
    if (gold + black + red + normal > 0) {
        land_dist = { 4: gold, 3: black, 2: red, 1: normal };
        const user_total = gold + black + red + normal;
        if (user_total !== lands) lands = user_total;
    } else {
        land_dist = {
            4: default_dist['4'] || 0,
            3: default_dist['3'] || 0,
            2: default_dist['2'] || 0,
            1: default_dist['1'] || 0
        };
    }

    const active_levels = [1, 2, 3, 4].filter(lv => (land_dist[lv] || 0) > 0);
    const min_land_level = active_levels.length > 0 ? Math.min(...active_levels) : 1;

    const eligible_crops = CROPS_DATA.crops.filter(c => c.level <= level);

    const plant_sec_no_fert = +(lands / PLANT_SPEED_NO_FERT).toFixed(4);
    const fert_action_sec = +(lands * FERT_ACTION_PER_LAND).toFixed(1);

    const results = eligible_crops.map(c => get_crop_stats(c, params, land_dist, lands, min_land_level, is_smart_fert, is_ideal, is_s2_fert));

    const objSortDesc = (a, b, key) => b[key] - a[key];
    const rows_fert = [...results].sort((a, b) => objSortDesc(a, b, 'expPerHourFert'));
    const rows_no_fert = [...results].sort((a, b) => objSortDesc(a, b, 'expPerHourNoFert'));
    const rows_gold_fert = [...results].sort((a, b) => objSortDesc(a, b, 'goldPerHourFert'));
    const rows_gold_no_fert = [...results].sort((a, b) => objSortDesc(a, b, 'goldPerHourNoFert'));

    return {
        level, lands, landDist: land_dist, totalCrops: eligible_crops.length,
        smartFert: is_smart_fert, ideal: is_ideal, secondSeasonFert: is_s2_fert,
        plantSecNoFert: plant_sec_no_fert, fertActionSec: fert_action_sec,
        rowsFert: rows_fert, rowsNoFert: rows_no_fert, rowsGoldFert: rows_gold_fert, rowsGoldNoFert: rows_gold_no_fert,
        bestFert: rows_fert[0] || null, bestNoFert: rows_no_fert[0] || null,
        bestGoldFert: rows_gold_fert[0] || null, bestGoldNoFert: rows_gold_no_fert[0] || null
    };
}

function _get_total_exp(lvl) {
    const item = EXP_TABLE.find(x => Math.floor(x.level) === Math.floor(lvl));
    return item ? Math.floor(item.total_exp) : 0;
}

function _get_best_crop_for_level(level, is_smart_fert = true, is_s2_fert = true, use_land_bonus = true) {
    const lands_info = calculate_lands_for_level(level);
    const lands = lands_info.lands;
    const default_dist = lands_info.distribution || {};
    let land_dist = {
        4: default_dist['4'] || 0,
        3: default_dist['3'] || 0,
        2: default_dist['2'] || 0,
        1: default_dist['1'] || 0
    };
    if (!use_land_bonus) land_dist = { 4: 0, 3: 0, 2: 0, 1: lands };

    const active_levels = [1, 2, 3, 4].filter(lv => (land_dist[lv] || 0) > 0);
    const min_land_level = active_levels.length > 0 ? Math.min(...active_levels) : 1;

    const eligible_crops = CROPS_DATA.crops.filter(c => c.level <= level);
    if (eligible_crops.length === 0) return [null, lands_info, land_dist, min_land_level];

    const params = { level: String(level), smart: '1', s2fert: is_s2_fert ? '1' : '0' };
    const results = eligible_crops.map(c => get_crop_stats(c, params, land_dist, lands, min_land_level, is_smart_fert, true, is_s2_fert));

    const best = results.reduce((prev, current) => (prev.expPerHourFert > current.expPerHourFert) ? prev : current);
    return [best, lands_info, land_dist, min_land_level];
}

function _build_segments(cur_level, tgt_level, cur_exp, is_smart_fert = true, is_s2_fert = true, use_land_bonus = true) {
    const segments = [];
    let exp_remaining = _get_total_exp(tgt_level) - _get_total_exp(cur_level) - cur_exp;
    if (exp_remaining <= 0) return [segments, 0];
    const total_exp_needed = exp_remaining;

    let level_changes = new Set();
    CROPS_DATA.crops.forEach(c => {
        if (cur_level < c.level && c.level <= tgt_level) level_changes.add(c.level);
    });
    Object.keys(LANDS_DATA).forEach(lvStr => {
        const lv = Number.parseInt(lvStr, 10);
        if (!isNaN(lv) && cur_level < lv && lv <= tgt_level) level_changes.add(lv);
    });
    const breakpoints = [...level_changes].sort((a, b) => a - b);
    const ranges = [];
    let start = cur_level;
    breakpoints.forEach(bp => {
        if (bp > start) { ranges.push([start, bp]); start = bp; }
    });
    if (start < tgt_level) ranges.push([start, tgt_level]);
    if (ranges.length === 0) ranges.push([cur_level, tgt_level]);

    const exp_accumulated = cur_exp;
    for (let i = 0; i < ranges.length; i++) {
        const [range_start, range_end] = ranges[i];
        if (exp_remaining <= 0) break;
        const [best, lands_info, land_dist, min_land_level] = _get_best_crop_for_level(range_start, is_smart_fert, is_s2_fert, use_land_bonus);
        if (!best) continue;

        const lands = lands_info.lands;
        const exp_per_cycle = best.expPerCycle || 0;
        if (exp_per_cycle <= 0) continue;

        let range_exp = _get_total_exp(range_end) - _get_total_exp(range_start);
        if (range_start === cur_level) range_exp -= exp_accumulated;
        range_exp = Math.max(0, Math.min(range_exp, exp_remaining));
        if (range_exp <= 0) continue;

        const cycles = Math.ceil(range_exp / exp_per_cycle);
        const actual_exp = exp_per_cycle * cycles;

        const fert_phase_sec = best.fertBestPhaseSec || 0;
        const is_two_season = best.twoSeasonDiff || false;

        let reg_per_cycle_sec = fert_phase_sec;
        if (is_two_season && is_s2_fert) {
            const phases = best.phaseDetails || [];
            let s2_max = 0;
            if (phases.length >= 2) {
                const redPct = LAND_BONUSES[min_land_level].timeReduce;
                const s2_phases_sec = phases.slice(-2).map(p => Math.max(1, Math.round(p.seconds * (1 - redPct))));
                s2_max = Math.max(...s2_phases_sec);
            }
            reg_per_cycle_sec = fert_phase_sec + s2_max;
        }

        const grow_time_fert = best.growTimeFert || 0;
        let org_per_cycle_sec;
        if (is_two_season) {
            if (is_s2_fert) {
                const s2_fert_sec = best.secondSeasonGrowFertSec || 0;
                org_per_cycle_sec = grow_time_fert + s2_fert_sec;
            } else {
                const s2_sec = best.secondSeasonGrowSec || 0;
                org_per_cycle_sec = grow_time_fert + s2_sec;
            }
        } else {
            org_per_cycle_sec = grow_time_fert;
        }

        const total_reg_sec = reg_per_cycle_sec * cycles;
        const total_org_sec = org_per_cycle_sec * cycles;
        const reg_h = total_reg_sec / 3600;
        const org_h = total_org_sec / 3600;

        const effective_reduce_pct = LAND_BONUSES[min_land_level].timeReduce;
        const land_bonus_parts = [];
        [4, 3, 2].forEach(lv => {
            const cnt = land_dist[lv] || 0;
            if (cnt > 0) land_bonus_parts.push({ level: lv, count: cnt, reduce: LAND_BONUSES[lv].timeReduce });
        });

        segments.push({
            level_start: range_start, level_end: range_end, crop_name: best.name, required_level: best.requiredLevel,
            lands, cycles, exp_per_cycle, exp: actual_exp, reg_h: +reg_h.toFixed(1), org_h: +org_h.toFixed(1),
            phase_count: best.phaseCount || 0, fert_phase_names: best.fertBestPhaseNames || [],
            fert_phase_orders: best.fertBestPhaseOrders || [], fert_phase_sec, fert_phases_all_same: best.fertPhasesAllSame || false,
            is_two_season, effective_reduce_pct, land_bonus_parts
        });
        exp_remaining -= actual_exp;
    }
    return [segments, total_exp_needed];
}

function _calc_level_bonus(cur_level, tgt_level) {
    const tier1_start = Math.max(cur_level + 1, 1);
    const tier1_end = Math.min(tgt_level, 39);
    const tier1_levels = tier1_start <= 39 ? Math.max(0, tier1_end - tier1_start + 1) : 0;

    const tier2_start = Math.max(cur_level + 1, 40);
    const tier2_end = Math.min(tgt_level, 59);
    const tier2_levels = tier2_start <= 59 ? Math.max(0, tier2_end - tier2_start + 1) : 0;
    const tier2_rewards = Math.floor(tier2_levels / 2);

    const tier1_fert_h = tier1_levels * 20;
    const tier1_coupons = tier1_levels * 80;
    const tier2_fert_h = tier2_rewards * 5;
    const tier2_coupons = tier2_rewards * 20;

    return {
        bonus_tier1_levels: tier1_levels, bonus_tier1_fert_h: tier1_fert_h, bonus_tier1_coupons: tier1_coupons,
        bonus_tier2_levels: tier2_levels, bonus_tier2_rewards: tier2_rewards, bonus_tier2_fert_h: tier2_fert_h, bonus_tier2_coupons: tier2_coupons,
        level_bonus_fert_h: tier1_fert_h + tier2_fert_h, level_bonus_coupons: tier1_coupons + tier2_coupons
    };
}

function _calc_fert_purchase(hours_needed, plan_days, fert_type = 'reg') {
    const items = [];
    let total_diamonds = 0;
    let remaining = hours_needed;

    if (fert_type === 'reg') {
        if (remaining >= 20) {
            const packs_20h = Math.min(Math.floor(remaining / 20), plan_days);
            if (packs_20h > 0) {
                const cost = packs_20h * 64;
                items.push({ name: '20h普通化肥礼包', hours: 20, count: packs_20h, cost_each: 64, cost_total: cost, daily_limit: 1, days_needed: packs_20h });
                remaining -= packs_20h * 20;
                total_diamonds += cost;
            }
        }
        if (remaining >= 5) {
            const packs_5h = Math.floor(remaining / 5);
            if (packs_5h > 0) {
                const cost = packs_5h * 16;
                items.push({ name: '5h普通化肥', hours: 5, count: packs_5h, cost_each: 16, cost_total: cost, daily_limit: 0, days_needed: 1 });
                remaining -= packs_5h * 5;
                total_diamonds += cost;
            }
        }
        if (remaining > 0) {
            const packs_1h = Math.ceil(remaining);
            const cost = packs_1h * 4;
            items.push({ name: '1h普通化肥', hours: 1, count: packs_1h, cost_each: 4, cost_total: cost, daily_limit: 0, days_needed: 1 });
            total_diamonds += cost;
        }
    } else {
        if (remaining >= 10) {
            const packs_10h = Math.floor(remaining / 10);
            const cost = packs_10h * 40;
            items.push({ name: '10h有机化肥', hours: 10, count: packs_10h, cost_each: 40, cost_total: cost, daily_limit: 0, days_needed: 1 });
            remaining -= packs_10h * 10;
            total_diamonds += cost;
        }
        if (remaining > 0) {
            const packs_5h = Math.ceil(remaining / 5);
            const cost = packs_5h * 20;
            items.push({ name: '5h有机化肥', hours: 5, count: packs_5h, cost_each: 20, cost_total: cost, daily_limit: 0, days_needed: 1 });
            total_diamonds += cost;
        }
    }
    return { items, diamonds: total_diamonds };
}

function _build_recharge_plan(diamonds_needed, first_tiers) {
    const plan = [];
    let remaining = diamonds_needed;
    const FIRST_CHARGE_TIERS = {
        '6': { yuan: 6, diamonds: 120, bonus: 60 },
        '30': { yuan: 30, diamonds: 600, bonus: 300 },
        '98': { yuan: 98, diamonds: 1960, bonus: 980 },
        '198': { yuan: 198, diamonds: 3960, bonus: 1980 },
        '648': { yuan: 648, diamonds: 12960, bonus: 6480 },
    };

    first_tiers.forEach(tier_key => {
        if (FIRST_CHARGE_TIERS[tier_key]) {
            const t = FIRST_CHARGE_TIERS[tier_key];
            const total_d = t.diamonds + t.bonus;
            plan.push({ type: '首充', yuan: t.yuan, diamonds: total_d, selected: true });
            remaining -= total_d;
        }
    });

    if (remaining > 0) {
        const normal_yuan = Math.ceil(remaining / 10);
        plan.push({ type: '普通充值', yuan: normal_yuan, diamonds: normal_yuan * 10, selected: true });
    }
    return plan;
}

function calculate_exp_plan(params) {
    ensureData();
    const cur_level = Number.parseInt(params.cur_level || '1', 10);
    const tgt_level = Number.parseInt(params.tgt_level || '2', 10);
    const cur_exp = Number.parseInt(params.cur_exp || '0', 10);
    const fert_h = Number.parseFloat(params.fert_h || '0');
    const org_h = Number.parseFloat(params.org_h || '0');
    const cur_diamonds = Number.parseInt(params.cur_diamonds || '0', 10);
    const cur_coupons = Number.parseInt(params.cur_coupons || '0', 10);
    let plan_days = Math.max(1, Number.parseInt(params.plan_days || '1', 10));
    const svip = params.svip === '1';
    const level_bonus = params.level_bonus === '1';
    const super_monthly = params.super_monthly_card === '1';
    const use_land_bonus = params.land_bonus === '1';
    const optimal_limit = params.optimal_limit === '1';
    const save_mode = String(params._path || '').includes('level_exp_calc_save');

    const first_tiers_str = params.first_tiers || '';
    const first_tiers = first_tiers_str.split(',').map(t => t.trim()).filter(Boolean);

    if (tgt_level <= cur_level) {
        return { error: `目标等级(Lv${tgt_level})必须大于当前等级(Lv${cur_level})` };
    }

    let exp_needed = _get_total_exp(tgt_level) - _get_total_exp(cur_level) - cur_exp;
    if (exp_needed < 0) exp_needed = 0;

    const [segments, total_exp] = _build_segments(cur_level, tgt_level, cur_exp, true, true, use_land_bonus);
    if (!segments || segments.length === 0) return { error: "No crops found for this level" };

    const total_reg_h = segments.reduce((acc, seg) => acc + seg.reg_h, 0);
    const total_org_h = segments.reduce((acc, seg) => acc + seg.org_h, 0);

    let daily_free_reg = 0; let daily_detail_parts = [];
    if (svip) { daily_free_reg += 5; daily_detail_parts.push('SVIP 5h'); }
    if (super_monthly) { daily_free_reg += 5; daily_detail_parts.push('超级月卡 5h'); }
    let free_fert_h = daily_free_reg * plan_days;
    const free_daily_detail = daily_detail_parts.join(' + ');

    let bonus_info = {}; let level_bonus_fert_h = 0; let level_bonus_coupons = 0;
    if (level_bonus) {
        bonus_info = _calc_level_bonus(cur_level, tgt_level);
        level_bonus_fert_h = bonus_info.level_bonus_fert_h || 0;
        level_bonus_coupons = bonus_info.level_bonus_coupons || 0;
    }

    let daily_coupons_rate = 0;
    if (svip) daily_coupons_rate += 10;
    if (super_monthly) daily_coupons_rate += 20;
    let total_daily_coupons = daily_coupons_rate * plan_days;
    let total_coupons = cur_coupons + level_bonus_coupons + total_daily_coupons;

    let org_from_coupons_packs = Math.floor(total_coupons / 42);
    let org_from_coupons_h = org_from_coupons_packs * 10;
    let coupon_remainder = total_coupons - org_from_coupons_packs * 42;

    const reg_saved_h = fert_h; const org_saved_h = org_h;
    let reg_to_buy = Math.max(0, Math.ceil(total_reg_h - reg_saved_h - free_fert_h - level_bonus_fert_h));
    let org_to_buy = Math.max(0, Math.ceil(total_org_h - org_saved_h - org_from_coupons_h));

    if (optimal_limit) {
        if (reg_to_buy > 0) {
            plan_days = Math.max(1, Math.ceil(reg_to_buy / 20));
            free_fert_h = daily_free_reg * plan_days;
            total_daily_coupons = daily_coupons_rate * plan_days;
            total_coupons = cur_coupons + level_bonus_coupons + total_daily_coupons;
            org_from_coupons_packs = Math.floor(total_coupons / 42);
            org_from_coupons_h = org_from_coupons_packs * 10;
            coupon_remainder = total_coupons - org_from_coupons_packs * 42;
            reg_to_buy = Math.max(0, Math.ceil(total_reg_h - reg_saved_h - free_fert_h - level_bonus_fert_h));
            org_to_buy = Math.max(0, Math.ceil(total_org_h - org_saved_h - org_from_coupons_h));
        }
    }

    const reg_purchase = reg_to_buy > 0 ? _calc_fert_purchase(reg_to_buy, plan_days, 'reg') : { items: [], diamonds: 0 };
    const org_purchase = org_to_buy > 0 ? _calc_fert_purchase(org_to_buy, plan_days, 'org') : { items: [], diamonds: 0 };

    const total_diamonds = reg_purchase.diamonds + org_purchase.diamonds;
    const diamonds_to_recharge = Math.max(0, total_diamonds - cur_diamonds);
    const remaining_diamonds = total_diamonds <= cur_diamonds ? cur_diamonds - total_diamonds : 0;

    let recharge_plan = [];
    if (diamonds_to_recharge > 0) recharge_plan = _build_recharge_plan(diamonds_to_recharge, first_tiers);

    return {
        cur_level, tgt_level, exp_needed, plan_days, segments,
        total_reg_needed: +total_reg_h.toFixed(1), total_org_needed: +total_org_h.toFixed(1),
        reg_saved_h: +reg_saved_h.toFixed(1), org_saved_h: +org_saved_h.toFixed(1),
        free_fert_h: +free_fert_h.toFixed(1), free_daily_detail,
        reg_to_buy, org_to_buy, reg_purchase, org_purchase,
        total_diamonds, cur_diamonds, diamonds_to_recharge, remaining_diamonds,
        recharge_plan, level_bonus_fert_h, level_bonus_coupons,
        total_coupons, cur_coupons, daily_coupons_rate, total_daily_coupons,
        org_from_coupons_h, coupon_remainder, save_mode, optimal_limit,
        ...bonus_info
    };
}

module.exports = {
    calculate_time_crops,
    calculate_lands_for_level,
    calculate_main,
    calculate_exp_plan
};
