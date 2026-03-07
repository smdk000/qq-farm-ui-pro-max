const express = require('express');
const farmCalculator = require('../services/farm-calculator');

const router = express.Router();

router.get('/time_crops', (req, res) => {
    try {
        res.json(farmCalculator.calculate_time_crops());
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/lands_for_level', (req, res) => {
    try {
        res.json(farmCalculator.calculate_lands_for_level(req.query.level || 1));
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/calculator', (req, res) => {
    try {
        res.json(farmCalculator.calculate_main(req.query));
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/level_exp_calc', (req, res) => {
    try {
        res.json(farmCalculator.calculate_exp_plan({ ...req.query, _path: req.path }));
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/level_exp_calc_save', (req, res) => {
    try {
        res.json(farmCalculator.calculate_exp_plan({ ...req.query, _path: req.path }));
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

module.exports = router;
