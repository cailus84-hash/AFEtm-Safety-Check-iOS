import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function historySource() {
  return readFileSync(new URL('../app/(tabs)/history.tsx', import.meta.url), 'utf8');
}

test('History short tap opens a local report modal without Expo Router assessment navigation', () => {
  const source = historySource();
  assert.match(source, /const \[selectedAssessment, setSelectedAssessment\] = useState<Assessment \| null>\(null\);/);
  assert.match(source, /onPress=\{compareMode \? \(\) => toggleSelect\(a\.id\) : \(\) => setSelectedAssessment\(a\)\}/);
  assert.match(source, /<LocalAssessmentReport[\s\S]*assessment=\{selectedAssessment\}[\s\S]*onClose=\{\(\) => setSelectedAssessment\(null\)\}/);
  assert.match(source, /import \{ AssessmentResultView \} from '@\/src\/components\/AssessmentResultView';/);
  assert.match(source, /<AssessmentResultView assessment=\{assessment\} onClose=\{onClose\} \/>/);
  assert.match(source, /testID="history-local-report-modal"/);
  assert.doesNotMatch(source, /<Link\b/);
  assert.doesNotMatch(source, /pathname: '\/assessment\/\[id\]'/);
  assert.doesNotMatch(source, /getAssessment\(/);
  assert.doesNotMatch(source, /createAssessment\(/);
  assert.doesNotMatch(source, /useHeartRateMonitor|PolarBle|connectPolar|startAssessment/);
  assert.doesNotMatch(source, /openAssessment/);
  assert.doesNotMatch(source, /assessmentRoute/);
});

test('History compare interactions remain wired separately from short-tap detail navigation', () => {
  const source = historySource();
  assert.match(source, /if \(compareMode\) return <View key=\{a\.id\}>\{card\}<\/View>;/);
  assert.match(source, /if \(!compareMode\) setCompareMode\(true\);[\s\S]*toggleSelect\(a\.id\);/);
});

test('History local report renders stored snapshot values without backend detail fetch', () => {
  const resultView = readFileSync(new URL('../src/components/AssessmentResultView.tsx', import.meta.url), 'utf8');
  assert.match(resultView, /const pending = !assessment\.zone;/);
  assert.match(resultView, /zoneLabelI18n\(t, assessment\.zone!\)/);
  assert.match(resultView, /assessment\.action \?\? '—'/);
  assert.match(resultView, /displayNumber\(assessment\.hr_peak\)/);
  assert.match(resultView, /displayNumber\(assessment\.recpct\)/);
  assert.match(resultView, /assessment\.readings\?\.\[tm\]/);
  assert.match(resultView, /assessment\.fcpv\.sleep/);
  assert.doesNotMatch(resultView, /getAssessment\(|createAssessment\(|useHeartRateMonitor|PolarBle|useLocalSearchParams/);
});
