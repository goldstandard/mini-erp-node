#!/usr/bin/env node

/**
 * Migration script: Import existing FX_rates.xlsx into fx_rates database table
 * Usage: node scripts/seed-fx-rates.js
 */

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const db = require('../src/backend/db/connection');
const fxRatesDb = require('../src/backend/fx-rates-db');

async function seedFxRates() {
  try {
    console.log('[FX Rates Seed] Starting...');
    
    // Initialize DB and create table
    await fxRatesDb.initFxRatesTable();
    console.log('[FX Rates Seed] Table initialized');
    
    // Check if FX rates already exist
    const periods = await fxRatesDb.getAvailableFxPeriods();
    if (periods.length > 0) {
      console.log(`[FX Rates Seed] Found ${periods.length} existing FX rate periods. Skipping import to avoid duplicates.`);
      console.log('[FX Rates Seed] If you want to re-import, delete the FX_rates table first.');
      process.exit(0);
    }
    
    // Import from Excel file
    const excelPath = path.join(__dirname, '..', 'data', 'FX_rates.xlsx');
    
    if (!fs.existsSync(excelPath)) {
      console.warn(`[FX Rates Seed] Excel file not found at ${excelPath}`);
      console.log('[FX Rates Seed] Skipping import.');
      process.exit(0);
    }
    
    console.log(`[FX Rates Seed] Reading Excel file: ${excelPath}`);
    
    // Parse Excel with full range to see all data
    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`[FX Rates Seed] Total rows parsed: ${rows.length}`);
    if (rows.length > 0) {
      console.log('[FX Rates Seed] First row keys:', Object.keys(rows[0]));
      console.log('[FX Rates Seed] First row:', rows[0]);
    }
    
    if (rows.length === 0) {
      console.warn('[FX Rates Seed] No data found in Excel file');
      process.exit(0);
    }
    
    // Parse data - handle case-sensitive keys
    const parsed = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    rows.forEach((row, idx) => {
      // Try to extract year/month and pair/rate from available columns
      const pair = row['CurrencyPair'] || row['FX_pair'] || row['Pair'];
      const rate = row['FX_Rate'] || row['Rate'];
      
      if (!pair || !rate) {
        return; // Skip rows without pair/rate
      }
      
      const rateNum = parseFloat(rate);
      if (!Number.isFinite(rateNum) || rateNum <= 0) {
        return;
      }
      
      const pairNorm = String(pair).trim().toUpperCase();
      if (!/^[A-Z]{3}[A-Z]{3}$/.test(pairNorm)) {
        return;
      }
      
      // Use current year/month since Excel doesn't have it
      parsed.push({
        year: currentYear,
        month: currentMonth,
        pair: pairNorm,
        rate: rateNum
      });
    });
    
    console.log(`[FX Rates Seed] Parsed ${parsed.length} valid FX rate entries`);
    
    if (parsed.length === 0) {
      console.warn('[FX Rates Seed] No valid FX rate entries found');
      process.exit(0);
    }
    
    // Group by period (should all be same in this case)
    const grouped = {};
    const key = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    grouped[key] = {
      year: currentYear,
      month: currentMonth,
      rates: {}
    };
    
    parsed.forEach(item => {
      grouped[key].rates[item.pair] = item.rate;
    });
    
    // Save to DB
    for (const period of Object.values(grouped)) {
      const result = await fxRatesDb.saveFxRates(period.year, period.month, period.rates, false);
      if (result.success) {
        console.log(`[FX Rates Seed] Period ${period.year}-${String(period.month).padStart(2, '0')}: ${result.inserted} rates inserted`);
      } else {
        console.warn(`[FX Rates Seed] Period ${period.year}-${String(period.month).padStart(2, '0')}: ${result.message}`);
      }
    }
    
    console.log(`[FX Rates Seed] ✓ Successfully imported FX rates for ${currentYear}-${String(currentMonth).padStart(2, '0')}`);
    process.exit(0);
  } catch (err) {
    console.error('[FX Rates Seed] Error:', err.message);
    process.exit(1);
  }
}

seedFxRates();
