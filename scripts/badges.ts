#!/usr/bin/env bun

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

interface CoverageData {
  percentage: number;
  color: string;
}

function calculateCoverageFromLcov(lcovPath: string): CoverageData {
  if (!existsSync(lcovPath)) {
    console.warn(`LCOV file not found at ${lcovPath}`);
    return { percentage: 0, color: 'red' };
  }

  try {
    const content = readFileSync(lcovPath, 'utf8');
    const lines = content.split('\n');
    
    let totalFound = 0;
    let totalHit = 0;

    for (const line of lines) {
      if (line.startsWith('LF:')) {
        totalFound += parseInt(line.split(':')[1] || '0', 10);
      }
      if (line.startsWith('LH:')) {
        totalHit += parseInt(line.split(':')[1] || '0', 10);
      }
    }

    const percentage = totalFound > 0 ? Math.round((totalHit / totalFound) * 100) : 0;
    
    let color: string;
    if (percentage >= 80) {
      color = 'brightgreen';
    } else if (percentage >= 60) {
      color = 'yellow';
    } else {
      color = 'red';
    }

    return { percentage, color };
  } catch (error) {
    console.error('Error parsing LCOV file:', error);
    return { percentage: 0, color: 'red' };
  }
}

async function downloadBadge(url: string, outputPath: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const svgContent = await response.text();
    writeFileSync(outputPath, svgContent, 'utf8');
    console.log(`Badge saved to ${outputPath}`);
  } catch (error) {
    console.error(`Error downloading badge from ${url}:`, error);
    throw error;
  }
}

async function generateBadges() {
  const assetsDir = path.resolve(process.cwd(), 'assets');
  
  // Ensure assets directory exists
  if (!existsSync(assetsDir)) {
    mkdirSync(assetsDir, { recursive: true });
  }

  // Generate test status badge (assume passing if this script runs)
  const testBadgeUrl = 'https://img.shields.io/badge/tests-passing-brightgreen.svg';
  const testBadgePath = path.join(assetsDir, 'test.svg');
  
  try {
    await downloadBadge(testBadgeUrl, testBadgePath);
  } catch (error) {
    console.error('Failed to generate test badge:', error);
  }

  // Generate coverage badge
  const lcovPath = path.resolve(process.cwd(), 'coverage', 'lcov.info');
  const { percentage, color } = calculateCoverageFromLcov(lcovPath);
  
  const coverageBadgeUrl = `https://img.shields.io/badge/coverage-${percentage}%25-${color}.svg`;
  const coverageBadgePath = path.join(assetsDir, 'coverage.svg');
  
  try {
    await downloadBadge(coverageBadgeUrl, coverageBadgePath);
    console.log(`Coverage badge generated: ${percentage}% (${color})`);
  } catch (error) {
    console.error('Failed to generate coverage badge:', error);
  }
}


// Main execution
async function main() {
  const args = process.argv.slice(2);
  await generateBadges();
}

// Only run main if this script is executed directly
if (import.meta.main) {
  main().catch((error) => {
    console.error('Script execution failed:', error);
    process.exit(1);
  });
}

export { generateBadges };
