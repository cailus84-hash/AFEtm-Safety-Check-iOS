import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

export type Lang = 'en' | 'es';
const STORAGE_KEY = 'afetm.lang';

/**
 * Master dictionary. English is 100% the source of truth. Spanish mirrors
 * every key. If a key is missing in the active language we fall back to
 * English so nothing ever renders as a raw key.
 */
const dict = {
  en: {
    // Brand + onboarding
    'brand.name': 'AFE™ Safety Check',
    'brand.tag': 'SAFETY CHECK',
    'brand.subtitle': 'Sports Performance Intelligence',
    'brand.tagline1': 'Before Training.',
    'brand.tagline2': 'Before Competition.',
    'brand.tagline3': 'Before Pushing Harder.',
    'onboarding.description':
      'Preventive cardiovascular recovery check to support responsible decisions before continuing your planned physical activity.',
    'onboarding.cta': 'Get Started',
    'onboarding.disclaimer':
      'Not a medical diagnostic application. Does not replace professional evaluation.',
    'onboarding.hero.alt': 'AFE™ Visual Color Guide',
    'onboarding.hero.badge': 'OFFICIAL VISUAL GUIDE',

    // Introduction tour (shown once after profile setup; reopenable from Profile)
    'tour.skip': 'Skip',
    'tour.continue': 'Continue',
    'tour.start': 'Start evaluation',
    'tour.step': '{n} / {total}',
    // Slide 1 — What is it
    'tour.s1.eyebrow': 'PREVENTIVE, NOT CLINICAL',
    'tour.s1.title': 'AFEtm Safety Check',
    'tour.s1.body':
      'A preventive, non-clinical check that observes your cardiac recovery before continuing training or competition.',
    'tour.s1.foot': 'Does not diagnose diseases and does not replace professional evaluation.',
    // Slide 2 — How it works
    'tour.s2.eyebrow': 'HOW DOES IT WORK',
    'tour.s2.title': 'Three simple steps',
    'tour.s2.step1': 'Reach the target heart rate indicated by the system.',
    'tour.s2.step2': 'Sit down and recover during 180 seconds.',
    'tour.s2.step3': 'Receive a color-based result with preventive guidance.',
    // Slide 3 — Colors
    'tour.s3.eyebrow': 'YOUR RESULT',
    'tour.s3.title': 'What your result means',
    'tour.s3.blue': 'Optimal. Very favorable recovery.',
    'tour.s3.green': 'Favorable. You can continue with usual observation.',
    'tour.s3.yellow':
      'Adjust. Better to moderate load, extend recovery and re-check.',
    'tour.s3.red':
      'Stop and re-check. Avoid intense effort and follow the corresponding safety protocol.',
    'tour.s3.footer':
      'The most important decisions are made before the first repetition.',
    // Profile card entry to re-open the tour
    'profile.tour.title': 'Introduction tour',
    'profile.tour.body': 'Watch the 3-slide introduction again.',

    // Terms of Personal Use — mandatory acceptance
    'terms.eyebrow': 'LICENSING · PERSONAL USE',
    'terms.title': 'Personal Use Only',
    'terms.intro':
      'AFEtm Mobile is licensed exclusively for your personal use and your own physiological and wellness information. Use for teams, athletes, patients, students, clients, schools, clubs, clinics, companies, universities, research projects, or other organizations requires prior express authorization from WeWon Smart Sport Solutions LLC.',
    'terms.sectionAllowed': 'YOU MAY',
    'terms.allowed.1': 'Record and review your own AFE™ Safety Checks.',
    'terms.allowed.2': 'Track your personal recovery, trend and history.',
    'terms.allowed.3': 'Set reminders for your own training sessions.',
    'terms.sectionNotAllowed': 'YOU MAY NOT',
    'terms.notAllowed.1': 'Create or manage athletes, patients, students or clients other than yourself.',
    'terms.notAllowed.2': 'Create teams, rosters, schools, clubs, clinics, companies, universities or organizations.',
    'terms.notAllowed.3': 'Perform evaluations on behalf of another person.',
    'terms.notAllowed.4': 'Use this app as a coach, trainer, clinician, researcher, teacher or institution.',
    'terms.notAllowed.5': 'Share a single personal account for institutional or team use.',
    // Bluetooth / hardware compatibility disclaimer (user's responsibility)
    'terms.sectionHardware': 'BLUETOOTH / HARDWARE COMPATIBILITY',
    'terms.hardware.1':
      'Compatibility, pairing, availability and correct operation of any Bluetooth Low Energy heart-rate monitor or third-party device depend on the manufacturer, the operating system and the mobile device — not on AFEtm.',
    'terms.hardware.2':
      'WeWon Smart Sport Solutions LLC is not responsible for the performance, connection quality, battery life, firmware or malfunction of Bluetooth accessories used with the app.',
    'terms.hardware.3':
      'If a Bluetooth device fails to connect or deliver readings, the athlete can always switch to Manual mode to continue the AFE™ Safety Check.',
    'terms.checkbox.self':
      'I confirm that I will use AFEtm Mobile only for myself.',
    'terms.checkbox.institutional':
      'I understand that institutional, team, professional, research or third-party use requires express authorization from WeWon Smart Sport Solutions LLC.',
    'terms.checkbox.terms':
      'I accept the Terms of Use and Privacy Policy.',
    'terms.privacy.link': 'Read the Privacy Policy',
    'terms.privacy.hint': 'Opens wewonsss.com/privacy-policy in your browser.',
    'terms.institutional.cta': 'Need institutional access?',
    'terms.institutional.link': 'Request institutional access',
    'terms.accept': 'Accept and continue',
    'terms.error.all': 'You must accept all three statements to continue.',
    'terms.error.save': 'Could not save your acceptance. Try again.',
    'terms.version': 'Terms v{version}',
    'terms.updated.eyebrow': 'TERMS UPDATED',
    'terms.updated.title': 'The Personal-Use Terms have been updated',
    'terms.updated.body':
      'We updated the AFEtm Mobile Personal-Use Terms. Please review the changes and re-accept them before continuing to use the app.',
    'terms.updated.previous': 'Previously accepted: v{previous}',
    'terms.updated.new': 'New version: v{version} · effective {date}',
    'terms.updated.changelog': "WHAT'S NEW",
    'terms.updated.accept': 'Accept updated terms',

    // Institutional access
    'inst.eyebrow': 'INSTITUTIONAL ACCESS',
    'inst.title': 'Institutional Access Required',
    'inst.body':
      'This functionality is available only through an authorized WeWon institutional license. Institutional use requires prior express authorization from WeWon Smart Sport Solutions LLC.',
    'inst.what.title': 'WHAT REQUIRES INSTITUTIONAL ACCESS',
    'inst.what.1': 'Teams, rosters and multi-athlete dashboards.',
    'inst.what.2': 'Clinics, universities, schools, clubs and companies.',
    'inst.what.3': 'Coaches, trainers, clinicians, teachers and researchers performing evaluations on other people.',
    'inst.what.4': 'Bulk assessments and third-party athlete records.',
    'inst.contact': 'Request institutional access',
    'inst.contact.hint': 'Opens wewonmatrix.com in your browser.',
    'inst.footer':
      'The mobile app cannot activate institutional access on its own. WeWon Smart Sport Solutions LLC authorizes institutional licenses separately.',
    'inst.openError': 'Could not open the external link.',

    // Personal-use banner in profile tab
    'profile.license.title': 'Personal Use Only',
    'profile.license.body':
      'This app is licensed exclusively for you. Team, clinical, research or institutional use requires a WeWon institutional license.',
    'profile.license.cta': 'Institutional access',

    // Server-side rejection messages (HTTP 403)
    'error.personalUse.ownership':
      'Personal-use rule: you cannot access data that belongs to another person.',
    'error.personalUse.terms':
      'You must accept the AFEtm Mobile Personal-Use Terms before continuing.',
    'error.personalUse.profile':
      'A personal profile is required before creating assessments.',
    'error.personalUse.ageMismatch':
      'Assessment age does not match your personal profile. AFEtm Mobile is licensed for personal use only.',

    // Common actions
    'common.next': 'Next',
    'common.back': 'Back',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.retry': 'Retry',
    'common.close': 'Close',
    'common.delete': 'Delete',
    'common.continue': 'Continue',
    'common.loading': 'Loading…',
    'common.pending': 'Pending',
    'common.unclassified': 'Unclassified',

    // Tabs
    'tabs.home': 'Home',
    'tabs.new': 'New',
    'tabs.history': 'History',
    'tabs.profile': 'Profile',

    // Home
    'home.eyebrow': 'AFE™ SAFETY CHECK',
    'home.greeting': 'Hello',
    'home.badge': 'PREVENTIVE',
    'home.newCheck': 'New Safety Check',
    'home.lastEval': 'Last assessment',
    'home.pending.title': 'Pending',
    'home.pending.desc':
      'Result pending sync with the official AFEtm engine. Tap to retry.',
    'home.emptyTitle': 'No previous assessments',
    'home.emptyBody':
      'Take your first Safety Check to know your current cardiovascular recovery status.',
    'home.stats.fcp': 'FCP TARGET',
    'home.stats.count': 'ASSESSMENTS',
    'home.stats.age': 'AGE',
    'home.stats.age.unit': 'years',
    'home.stats.fcp.unit': 'bpm',
    'home.trend.title': 'Weekly trend',
    'home.trend.subtitle': 'Recovery (RECpct) — last {n} assessments',
    'home.trend.empty': 'Take more checks to see your trend.',
    'home.how.title': 'How does it work?',
    'home.how.1': 'Record your Resting Heart Rate (RHR).',
    'home.how.2': 'Reach the FCP target with a controlled effort.',
    'home.how.3': 'Record your HR during 3 minutes of recovery.',
    'home.how.4': 'Receive your AFE zone and suggested preventive action.',
    'home.disclaimer':
      'Preventive tool. Not a medical diagnostic application. Does not replace a health professional.',
    'home.meta.pattern': 'Pattern {name}',
    // License reminder — shown on the 1st of every month on Home
    'home.license.eyebrow': 'MONTHLY REMINDER',
    'home.license.title': "You're on a Personal license",
    'home.license.body':
      'AFEtm Mobile is for your personal use only. Institutional or team use requires a WeWon license.',
    'home.license.cta': 'Institutional access',
    'home.license.dismiss': 'Dismiss',
    // Paywall & subscription
    'paywall.eyebrow': 'AFE™ PERSONAL',
    'paywall.title': 'Full access to AFEtm Safety Check',
    'paywall.subtitle':
      'Preventive check-ins before every training or competition — the informed decision starts here.',
    'paywall.trialBadge': '1 MONTH FREE',
    'paywall.benefit.assessments': 'Unlimited AFEtm Safety Checks',
    'paywall.benefit.history': 'Personal history and detail charts',
    'paywall.benefit.compare': 'Session comparison and trends',
    'paywall.benefit.recovery': 'Recovery follow-up and reminders',
    'paywall.plan.monthly.title': 'Monthly plan',
    'paywall.plan.monthly.price': '$19.99 / month',
    'paywall.plan.yearly.title': 'Yearly plan',
    'paywall.plan.yearly.price': '$199.99 / year',
    'paywall.plan.yearly.badge': 'BEST VALUE',
    'paywall.plan.yearly.save': 'Save {p}% vs monthly',
    'paywall.cta.trial': 'Start 1 Month Free',
    'paywall.cta.monthly': 'Monthly $19.99',
    'paywall.cta.yearly': 'Annual $199.99',
    'paywall.cta.trial.sub': '$0 today · Cancel anytime in your store',
    'paywall.disclosure.title': "WHAT HAPPENS WHEN YOU TAP “START 1 MONTH FREE”",
    'paywall.disclosure.today': '$0 today.',
    'paywall.disclosure.renew':
      'Your subscription automatically renews after the 1-month free trial unless canceled through the App Store or Google Play at least 24 hours before the trial ends.',
    'paywall.disclosure.store':
      'Payment method is required and managed by Apple or Google. AFEtm never sees or stores card information.',
    'paywall.manage': 'Manage Subscription',
    'paywall.restore': 'Restore Purchases',
    'paywall.legal.tool':
      'AFEtm Safety Check is a preventive and educational tool. It is not clinical.',
    'paywall.legal.renew':
      'Subscription renews automatically unless cancelled from the corresponding store.',
    'paywall.error.trial': 'Could not start the free trial.',
    'paywall.error.purchase': 'Could not complete the purchase.',
    'paywall.error.restore': 'Could not restore purchases.',
    'paywall.trialUsed':
      'The free trial has already been used on this device. Choose a plan to continue.',
    'paywall.success.trial': 'Free trial activated. Enjoy your access!',
    'paywall.success.purchase': 'Subscription active. Thank you!',
    'paywall.dismiss': 'Not now',

    // Manage subscription
    'manage.title': 'Manage subscription',
    'manage.status': 'STATUS',
    'manage.status.trial': 'Free trial',
    'manage.status.active': 'Active',
    'manage.status.expired': 'Expired',
    'manage.status.none': 'No active plan',
    'manage.plan': 'PLAN',
    'manage.plan.monthly': 'Monthly · $19.99 / month',
    'manage.plan.yearly': 'Yearly · $199.99 / year',
    'manage.plan.trial': 'Free trial (1 month)',
    'manage.plan.none': '—',
    'manage.expires': 'RENEWS / EXPIRES',
    'manage.expires.none': '—',
    'manage.expires.in': 'In {n} days',
    'manage.expires.past': 'Expired',
    'manage.cancel': 'Cancel subscription',
    'manage.cancel.hint':
      'Cancelling here records your intent — the actual cancellation happens on the store where you subscribed.',
    'manage.canceled.badge': 'Cancelled',
    'manage.canceled.body':
      'You cancelled on {date}. Access remains until {expires}.',
    'manage.restore': 'Restore purchases',
    'manage.legal':
      'Subscription renews automatically unless cancelled from the corresponding store (App Store or Google Play).',
    'manage.upgrade': 'Change plan',
    'manage.pill.expiresAt': 'Until {date}',

    // Profile entry
    'profile.subscription.title': 'Manage subscription',
    'profile.subscription.body': 'Plan, renewal and cancellation.',

    // Home gate banner
    'home.subscription.gate.title': 'Subscription required',
    'home.subscription.gate.body':
      'Your free trial has ended. Choose a plan to keep taking AFE™ Safety Checks.',
    'home.subscription.gate.cta': 'View plans',
    'home.subscription.gate.trialCta': 'Start 1-month free trial',
    'home.subscription.trial.pill': '{n} days left of free trial',
    'home.subscription.active.pill': 'Active plan',

    // New choice screen
    'new.eyebrow': 'NEW SAFETY CHECK',
    'new.title': 'Choose the mode',
    'new.subtitle':
      'Run your AFE™ check using a Bluetooth heart-rate monitor (recommended) or by entering the values manually.',
    'new.guided.title': 'Guided with heart-rate monitor',
    'new.guided.desc':
      'Connect a compatible Bluetooth heart-rate monitor (HR profile 0x180D). Records RHR live, reaches FCP and captures the 3-minute window with 5s anti-noise averaging.',
    'new.guided.badge': 'RECOMMENDED',
    'new.step.scan': 'Scan',
    'new.step.connect': 'Connect',
    'new.step.rhr': 'RHR',
    'new.step.fcp': 'FCP',
    'new.step.recovery': 'Recovery',
    'new.manual.title': 'Manual',
    'new.manual.desc':
      'Manually enter RHR and the recovery-window readings. Useful if you do not have a compatible monitor.',
    'new.web.warning':
      'Guided mode requires native Bluetooth Low Energy and does not work in the web preview or in Expo Go. Generate an iOS/Android build to try it.',
    'new.ble.disclaimer.title': 'Bluetooth compatibility',
    'new.ble.disclaimer.body':
      'Compatibility, pairing and reading quality of any BLE heart-rate monitor depend on the manufacturer and your device — not on AFEtm. WeWon Smart Sport Solutions LLC is not responsible for third-party Bluetooth hardware.',

    // History
    'history.eyebrow': 'RECORD',
    'history.title': 'History',
    'history.compare': 'Compare',
    'history.exit': 'Exit',
    'history.filter.all': 'All',
    'history.empty.title': 'No history available',
    'history.empty.body': 'Take your first Safety Check and your assessments will appear here.',
    'history.compare.selectTwo': 'Select 2 assessments',
    'history.compare.selectOne': 'Select 1 more',
    'history.compare.ready': '2 assessments selected',
    'history.meta.rec': 'Rec {value}%',

    // Compare
    'compare.title': 'Compare',
    'compare.eyebrow': 'SESSIONS',
    'compare.heading': 'Overlaid curves',
    'compare.section.deltas': 'DIFFERENCES (B − A)',
    'compare.footer':
      'Higher RECpct and HRR mean better recovery; a lower τ (tau) means faster kinetics.',
    'compare.session.a': 'A · Previous',
    'compare.session.b': 'B · Recent',
    'compare.error.title': 'Comparison not available',
    'compare.error.select': 'Select exactly two assessments.',

    // Profile setup
    'setup.eyebrow': 'STEP 1 OF 1',
    'setup.title': 'Athlete profile',
    'setup.subtitle':
      'Enter your baseline data. We use it to compute your peak heart-rate target.',
    'setup.field.name': 'Name',
    'setup.field.name.ph': 'Your name',
    'setup.field.age': 'Age',
    'setup.field.weight': 'Weight (kg)',
    'setup.field.sport': 'Sport',
    'setup.field.target': 'Target zone (optional)',
    'setup.field.target.hint':
      'When you reach or exceed this zone in a check, we celebrate it with you.',
    'setup.target.none': 'None',
    'setup.target.green': 'Green · Favorable',
    'setup.target.blue': 'Blue · Optimal',
    'setup.error.name': 'Enter your name.',
    'setup.error.age': 'Age must be between 10 and 90.',
    'setup.error.weight': 'Weight must be between 20 and 250 kg.',
    'setup.error.athleteId':
      'AFEtm athleteId must be a positive number. Leave empty if you do not have one yet.',
    'setup.error.save': 'Could not save profile.',
    'setup.save': 'Save profile',
    'setup.field.athleteId': 'AFEtm athleteId',
    'setup.field.athleteId.ph': 'e.g. 1024',
    'setup.field.athleteId.hint':
      'Numeric ID provided by WeWon Smart Sport Solutions LLC. Required before running an assessment. AFEtm never invents identifiers.',
    'sport.running': 'Running',
    'sport.cycling': 'Cycling',
    'sport.football': 'Football',
    'sport.crossfit': 'CrossFit',
    'sport.swimming': 'Swimming',
    'sport.other': 'Other',

    // Profile tab
    'profile.eyebrow': 'ATHLETE',
    'profile.title': 'Profile',
    'profile.edit': 'Edit profile',
    'profile.reminders': 'Check reminders',
    'profile.target.blue': 'Target: Blue Zone',
    'profile.target.green': 'Target: Green Zone',
    'profile.stat.age': 'AGE',
    'profile.stat.age.unit': 'years',
    'profile.stat.weight': 'WEIGHT',
    'profile.stat.weight.unit': 'kg',
    'profile.stat.fcp': 'FCP TARGET',
    'profile.stat.fcp.unit': 'bpm',
    'profile.about.title': 'About AFE™ Safety Check',
    'profile.about.body':
      'AFEtm (Early Physiological Impact Alarm) is a preventive decision-support protocol that evaluates cardiac recovery during a controlled effort.',
    'profile.about.b1': 'Supports preventive decision-making.',
    'profile.about.b2': 'Not a medical diagnostic application.',
    'profile.about.b3': 'Does not replace professional evaluation.',
    'profile.empty': 'No profile',
    'profile.create': 'Create profile',
    'profile.language.section': 'LANGUAGE',
    'profile.language.en': 'English',
    'profile.language.es': 'Español',
    'profile.language.hint':
      'Switch the entire app between 100% English and 100% Spanish.',

    // Reminders
    'reminders.title': 'Reminders',
    'reminders.eyebrow': 'PREVENTIVE HABIT',
    'reminders.heading': 'Schedule your checks',
    'reminders.subtitle':
      'Get a local notification before your demanding sessions. Ideal right before your usual training window.',
    'reminders.perm.blocked':
      'Notifications are disabled. Enable them in system Settings to receive reminders.',
    'reminders.section.active': 'ACTIVE',
    'reminders.section.new': 'NEW',
    'reminders.empty': 'No active reminders.',
    'reminders.field.label': 'Label',
    'reminders.field.label.default': 'Check before training',
    'reminders.field.label.ph': 'Check before training',
    'reminders.field.time': 'Time',
    'reminders.field.days': 'Days',
    'reminders.days.pick': 'Pick days',
    'reminders.error.days': 'Pick at least one day.',
    'reminders.error.save': 'Could not create the reminder.',
    'reminders.create': 'Create reminder',
    'weekday.short.1': 'S',
    'weekday.short.2': 'M',
    'weekday.short.3': 'T',
    'weekday.short.4': 'W',
    'weekday.short.5': 'T',
    'weekday.short.6': 'F',
    'weekday.short.7': 'S',
    'weekday.long.1': 'Sunday',
    'weekday.long.2': 'Monday',
    'weekday.long.3': 'Tuesday',
    'weekday.long.4': 'Wednesday',
    'weekday.long.5': 'Thursday',
    'weekday.long.6': 'Friday',
    'weekday.long.7': 'Saturday',

    // Manual assessment
    'assess.step': 'STEP {n} OF {total}',
    'assess.rhr.title': 'Resting Heart Rate',
    'assess.rhr.body':
      'Before exerting yourself, record your resting HR (ideally seated and calm for 2 minutes).',
    'assess.rhr.range': 'Typical range 40–90 bpm',
    'assess.fcp.title': 'Peak Heart-Rate target',
    'assess.fcp.body':
      'Effort target computed from your age. Reach it with a controlled effort before starting the recovery window.',
    'assess.fcp.label': 'FCP TARGET',
    'assess.fcp.tip':
      'When you reach the FCP, stop the effort and start recording your HR on the schedule in the next step.',
    'assess.readings.title': 'Recovery window',
    'assess.readings.body':
      'Record your HR at the following intervals (seconds since the effort ended).',
    'assess.readings.hint':
      't=0s is your HR when you reach the FCP. t=180s is your HR at 3 minutes.',
    'assess.context.title': 'AFEtm Contextual Interview',
    'assess.context.body':
      'Select the factors that apply to you right now. This is required by the official AFEtm engine before every assessment.',
    'assess.context.notes': 'Notes (optional)',
    'assess.context.notes.ph':
      'Anything else the AFEtm engine should know about this assessment (max 2,000 characters).',
    'assess.context.notes.count': '{n} / 2000',
    'assess.context.none.hint': 'Tapping “None” clears every other factor.',
    'assess.factor.illness': 'Recent or current illness',
    'assess.factor.sleep': 'Poor sleep',
    'assess.factor.training': 'Elevated recent training load',
    'assess.factor.dehydration': 'Poor hydration',
    'assess.factor.medication': 'Medication use',
    'assess.factor.pain': 'Pain or discomfort',
    'assess.factor.stimulants': 'Stimulants (caffeine / energy drinks)',
    'assess.factor.none': 'No relevant contextual factors',
    'assess.submit': 'Compute result',
    'assess.error.rhr': 'RHR must be between 30 and 130 bpm.',
    'assess.error.reading': 'Reading t={t}s must be between 40 and 230 bpm.',
    'assess.error.peak': 'Peak HR (t=0s) must be close to the FCP target ({fcp}).',
    'assess.error.factors':
      'Select at least one AFEtm contextual factor before continuing. Use “None” if none applies.',
    'assess.error.athleteId':
      'Your profile is missing an AFEtm athleteId. Please add it under Profile before running an assessment. AFEtm never invents identifiers.',
    'assess.error.upstream':
      'Authoritative AFEtm server rejected the request (HTTP {status}). Detail: {body}. The assessment WAS NOT saved.',
    'assess.error.generic': 'Could not compute the assessment.',

    // FCPv questions
    'fcpv.q.sleep': 'Sleep the night before',
    'fcpv.q.sleep.hint': 'How did you sleep?',
    'fcpv.q.sleep.0': 'Good (7-9 h)',
    'fcpv.q.sleep.1': 'Fair',
    'fcpv.q.sleep.2': 'Poor / not enough',
    'fcpv.q.hydration': 'Hydration',
    'fcpv.q.hydration.hint': 'How hydrated are you today?',
    'fcpv.q.hydration.0': 'Adequate',
    'fcpv.q.hydration.1': 'Low',
    'fcpv.q.hydration.2': 'Very low',
    'fcpv.q.symptoms': 'Current symptoms',
    'fcpv.q.symptoms.hint': 'Dizziness, palpitations, unusual fatigue',
    'fcpv.q.symptoms.0': 'None',
    'fcpv.q.symptoms.1': 'Mild',
    'fcpv.q.symptoms.2': 'Noticeable',
    'fcpv.q.recent_illness': 'Recent illness',
    'fcpv.q.recent_illness.hint': 'Last 14 days',
    'fcpv.q.recent_illness.0': 'No',
    'fcpv.q.recent_illness.1': 'Mild',
    'fcpv.q.recent_illness.2': 'Yes',
    'fcpv.q.subjective_load': 'Subjective load',
    'fcpv.q.subjective_load.hint': 'Perception of prior effort',
    'fcpv.q.subjective_load.0': 'Low',
    'fcpv.q.subjective_load.1': 'Moderate',
    'fcpv.q.subjective_load.2': 'High',

    // Guided
    'guided.title': 'Guided with BLE',
    'guided.phase.scan': 'Searching for monitor',
    'guided.phase.connect': 'Connecting',
    'guided.phase.ready': 'Ready',
    'guided.phase.fcr': 'Record RHR',
    'guided.phase.fcp': 'Reach FCP',
    'guided.phase.recovery': '3-min recovery',
    'guided.phase.submit': 'Computing',
    'guided.phase.error': 'Error',
    'guided.unsupported.title': 'BLE not available in this environment',
    'guided.unsupported.web':
      'The web preview does not support Bluetooth Low Energy. Scan the Expo QR or generate a native build to use Guided mode.',
    'guided.unsupported.native':
      'Expo Go does not include react-native-ble-plx. Generate a development build (Publish → Generate iOS/Android build) to try it.',
    'guided.unsupported.cta': 'Use manual mode',
    'guided.live.label': 'LIVE HEART RATE',
    'guided.live.active': 'Active signal from the monitor.',
    'guided.live.idle': 'Waiting for signal from the monitor…',
    'guided.devices': 'DEVICES',
    'guided.scan': 'Scan',
    'guided.scanning': 'Searching for compatible monitors (HR profile 0x180D)…',
    'guided.no.devices':
      'No monitors found. Make sure it is on and in pairing mode.',
    'guided.connecting.title': 'Connecting…',
    'guided.connecting.body': 'Establishing connection with the monitor.',
    'guided.ready.title': 'Monitor connected',
    'guided.ready.body':
      'Get comfortable and calm. In the next step we will record your Resting HR (RHR).',
    'guided.fcr.title': 'Record your RHR',
    'guided.fcr.body':
      'Sit and breathe calmly for ~1 minute. When your live HR is stable, press Register. We will automatically average the last 15 s.',
    'guided.fcr.register': 'Register RHR',
    'guided.fcr.error': 'Could not register RHR. Stay calm and wait a few seconds.',
    'guided.fcp.title': 'Reach your FCP target',
    'guided.fcp.body':
      'Perform a controlled effort until you approach the target. When you reach it, stop the effort and press Start recovery.',
    'guided.fcp.rhr': 'RHR',
    'guided.fcp.target': 'FCP TARGET',
    'guided.fcp.live': 'LIVE',
    'guided.fcp.start': 'Start recovery',
    'guided.fcp.error': 'Reach at least ~{n} bpm before starting recovery.',
    'guided.recovery.captures': 'AUTOMATIC CAPTURES',
    'guided.recovery.captures.hint':
      'Each checkpoint averages the last 5 s to remove signal noise.',
    'guided.recovery.peak': 't=0s (Peak)',
    'guided.submit.title': 'Computing result…',
    'guided.submit.body': 'Analyzing your recovery curve.',
    'guided.error.title': 'Error',
    'guided.error.retry': 'Retry',
    'guided.error.default': 'Something went wrong. Try again.',
    'guided.perm.title': 'Permissions required',
    'guided.perm.body':
      'Grant Bluetooth access so we can detect your heart-rate monitor.',
    'guided.perm.retry': 'Retry permissions',
    'guided.reconnect':
      'Reconnecting to monitor… Timer keeps running. Attempt {n}.',
    'guided.pill.scanning': 'Scanning…',
    'guided.pill.disconnected': 'Not connected',
    'guided.pill.reconnecting': 'Reconnecting… ({n})',

    // Detail
    'detail.title': 'Result',
    'detail.notFound': 'Assessment not found',
    'detail.back': 'Back',
    'detail.section.metrics': 'Recovery metrics',
    'detail.section.reference': 'Reference data',
    'detail.section.readings': 'Readings per checkpoint',
    'detail.section.context': 'Preventive context (FCPv)',
    'detail.section.chart': 'Recovery curve',
    'detail.zone.eyebrow': 'AFE ZONE',
    'detail.chip.pattern': 'PATTERN',
    'detail.chip.action': 'ACTION',
    'detail.pending.eyebrow': 'STATUS',
    'detail.pending.title': 'Pending sync',
    'detail.pending.desc':
      'Result pending sync with the official AFEtm engine.',
    'detail.pending.hint':
      'Measurements were saved correctly. The zone (Blue / Green / Yellow / Red) is only shown when the authoritative server classifies it.',
    'detail.resync': 'Retry sync',
    'detail.resync.error': 'Could not retry the sync.',
    'detail.celebrate': 'You reached your target zone! Great recovery.',
    'detail.metric.hrr.hint': 'Drop 1 min',
    'detail.metric.recpct.hint': 'Recovery 3 min',
    'detail.metric.aurc.hint': 'Area under curve',
    'detail.metric.tau.hint': 'Kinetics',
    'detail.ref.rhr': 'RHR',
    'detail.ref.peak': 'Peak HR',
    'detail.ref.fcp': 'FCP target',
    'detail.ref.age': 'Age',
    'detail.ref.age.unit': 'years',
    'detail.fcpv.sleep': 'Sleep',
    'detail.fcpv.hydration': 'Hydration',
    'detail.fcpv.symptoms': 'Symptoms',
    'detail.fcpv.illness': 'Recent illness',
    'detail.fcpv.load': 'Subjective load',
    'detail.fcpv.total': 'TOTAL',
    'detail.contextFlag':
      'Elevated context. Consider reducing load even if the computed zone is favorable.',
    'detail.disclaimer':
      'Not a medical diagnostic application. AFE™ Safety Check supports preventive decisions and does not replace professional evaluation. If you have concerning symptoms, stop the activity and follow the corresponding safety protocols.',
    'detail.delete.confirm': 'Delete this assessment? This cannot be undone.',
    'detail.home': 'Back to home',
    'detail.share.web':
      'Export is not available in the web preview. Try Expo Go or a native build.',
    'detail.share.error': 'Could not share the result.',
    'detail.share.unavailable': 'Sharing is not available on this device.',
    'detail.share.prepareErr': 'Could not prepare the image.',
    'detail.share.title': 'Share AFE™ result',

    // Color guide
    'guide.eyebrow': 'AFE™ VISUAL GUIDE',
    'guide.title': 'Color interpretation',
    'guide.subtitle':
      'A simple, user-friendly overview of what each color means for your next training decision.',
    'guide.footer': 'WHAT DOES THIS GUIDE MEAN?',
    'guide.h1': 'Supports preventive decision-making.',
    'guide.h2': 'Not a medical diagnostic application.',
    'guide.h3': "Must be interpreted with the athlete's context.",
    'guide.action.BLUE': 'Continue',
    'guide.action.GREEN': 'Observe',
    'guide.action.YELLOW': 'Adjust',
    'guide.action.RED': 'Stop intense load and reassess',
    'guide.explanation.BLUE': 'Your cardiac recovery today looks excellent.',
    'guide.explanation.GREEN': 'Your cardiac recovery today looks favorable.',
    'guide.explanation.YELLOW': 'Your cardiac recovery today shows caution signs.',
    'guide.explanation.RED': 'Your cardiac recovery today looks compromised.',
    'guide.recommendation.BLUE':
      'Continue with your planned session as usual.',
    'guide.recommendation.GREEN':
      'Continue normally, staying attentive to how you feel.',
    'guide.recommendation.YELLOW':
      'Reduce load, extend warm-up and recovery, and re-check.',
    'guide.recommendation.RED':
      'Avoid intense effort. Rest, follow safety protocols and reassess before returning.',

    // Zones
    'zone.BLUE.label': 'Blue · Optimal',
    'zone.GREEN.label': 'Green · Favorable',
    'zone.YELLOW.label': 'Yellow · Caution',
    'zone.RED.label': 'Red · Alert',
    'zone.BLUE.short': 'BLUE',
    'zone.GREEN.short': 'GREEN',
    'zone.YELLOW.short': 'YELLOW',
    'zone.RED.short': 'RED',
    'zone.BLUE.desc':
      'Very favorable state. Excellent cardiac recovery and a highly positive overall response.',
    'zone.GREEN.desc':
      'Favorable state. Adequate condition to train or continue normally.',
    'zone.YELLOW.desc':
      'Caution state. Observe the context and adjust load if necessary.',
    'zone.RED.desc':
      'Alert state. Consider professional review before demanding efforts.',

    // Patterns
    'pattern.RAPID': 'Fast',
    'pattern.NORMAL': 'Normal',
    'pattern.DELAYED': 'Slow',
    'pattern.FLATTENED': 'Plateau',
    'pattern.UNSTABLE': 'Unstable',
  },
  es: {
    'brand.name': 'AFE™ Safety Check',
    'brand.tag': 'SAFETY CHECK',
    'brand.subtitle': 'Sports Performance Intelligence',
    'brand.tagline1': 'Antes de entrenar.',
    'brand.tagline2': 'Antes de competir.',
    'brand.tagline3': 'Antes de exigir más.',
    'onboarding.description':
      'Chequeo preventivo de recuperación cardiovascular para apoyar decisiones responsables antes de continuar con tu actividad física planificada.',
    'onboarding.cta': 'Comenzar',
    'onboarding.disclaimer':
      'No es una aplicación de diagnóstico médico. No sustituye la evaluación profesional.',
    'onboarding.hero.alt': 'Guía Visual de Colores AFE™',
    'onboarding.hero.badge': 'GUÍA VISUAL OFICIAL',

    // Tour de introducción
    'tour.skip': 'Saltar',
    'tour.continue': 'Continuar',
    'tour.start': 'Comenzar evaluación',
    'tour.step': '{n} / {total}',
    'tour.s1.eyebrow': 'PREVENTIVO, NO CLÍNICO',
    'tour.s1.title': 'AFEtm Safety Check',
    'tour.s1.body':
      'Chequeo preventivo, no clínico, que observa tu recuperación cardiaca antes de continuar con entrenamiento o competencia.',
    'tour.s1.foot': 'No diagnostica enfermedades ni reemplaza evaluación profesional.',
    'tour.s2.eyebrow': '¿CÓMO FUNCIONA?',
    'tour.s2.title': 'Tres pasos simples',
    'tour.s2.step1': 'Alcanza la frecuencia cardiaca objetivo indicada por el sistema.',
    'tour.s2.step2': 'Siéntate y recupera durante 180 segundos.',
    'tour.s2.step3': 'Recibe un resultado por color con orientación preventiva.',
    'tour.s3.eyebrow': 'TU RESULTADO',
    'tour.s3.title': '¿Qué significa tu resultado?',
    'tour.s3.blue': 'Óptimo. Recuperación muy favorable.',
    'tour.s3.green': 'Favorable. Puedes continuar con observación habitual.',
    'tour.s3.yellow':
      'Ajustar. Conviene moderar carga, ampliar recuperación y reevaluar.',
    'tour.s3.red':
      'Detener y reevaluar. Evita exigencia intensa y sigue el protocolo de seguridad correspondiente.',
    'tour.s3.footer':
      'Las decisiones más importantes se toman antes de la primera repetición.',
    'profile.tour.title': 'Tour de introducción',
    'profile.tour.body': 'Vuelve a ver la introducción de 3 pantallas.',

    // Términos de uso personal
    'terms.eyebrow': 'LICENCIA · USO PERSONAL',
    'terms.title': 'Uso Personal Únicamente',
    'terms.intro':
      'AFEtm Mobile está licenciado exclusivamente para tu uso personal y tu propia información fisiológica y de bienestar. El uso para equipos, atletas, pacientes, estudiantes, clientes, escuelas, clubes, clínicas, empresas, universidades, proyectos de investigación u otras organizaciones requiere autorización expresa previa de WeWon Smart Sport Solutions LLC.',
    'terms.sectionAllowed': 'PUEDES',
    'terms.allowed.1': 'Registrar y revisar tus propios chequeos AFE™ Safety Check.',
    'terms.allowed.2': 'Ver tu recuperación, tendencia e historial personal.',
    'terms.allowed.3': 'Programar recordatorios de tus propios entrenamientos.',
    'terms.sectionNotAllowed': 'NO PUEDES',
    'terms.notAllowed.1': 'Crear o administrar atletas, pacientes, estudiantes o clientes distintos a ti.',
    'terms.notAllowed.2': 'Crear equipos, rosters, escuelas, clubes, clínicas, empresas, universidades u organizaciones.',
    'terms.notAllowed.3': 'Realizar evaluaciones por cuenta de otra persona.',
    'terms.notAllowed.4': 'Usar esta app como entrenador, clínico, investigador, docente o institución.',
    'terms.notAllowed.5': 'Compartir una sola cuenta personal para uso institucional o de equipo.',
    'terms.sectionHardware': 'COMPATIBILIDAD BLUETOOTH / HARDWARE',
    'terms.hardware.1':
      'La compatibilidad, el emparejamiento, la disponibilidad y el correcto funcionamiento de cualquier pulsómetro Bluetooth Low Energy o dispositivo de terceros dependen del fabricante, el sistema operativo y el dispositivo móvil — no de AFEtm.',
    'terms.hardware.2':
      'WeWon Smart Sport Solutions LLC no es responsable del desempeño, la calidad de conexión, la batería, el firmware ni el mal funcionamiento de accesorios Bluetooth usados con la app.',
    'terms.hardware.3':
      'Si un dispositivo Bluetooth falla al conectarse o al entregar lecturas, el atleta siempre puede continuar en modo Manual para completar el AFE™ Safety Check.',
    'terms.checkbox.self':
      'Confirmo que usaré AFEtm Mobile solo para mí.',
    'terms.checkbox.institutional':
      'Entiendo que el uso institucional, de equipo, profesional, de investigación o de terceros requiere autorización expresa de WeWon Smart Sport Solutions LLC.',
    'terms.checkbox.terms':
      'Acepto los Términos de Uso y la Política de Privacidad.',
    'terms.privacy.link': 'Leer la Política de Privacidad',
    'terms.privacy.hint': 'Abre wewonsss.com/privacy-policy en tu navegador.',
    'terms.institutional.cta': '¿Necesitas acceso institucional?',
    'terms.institutional.link': 'Solicitar acceso institucional',
    'terms.accept': 'Aceptar y continuar',
    'terms.error.all': 'Debes aceptar las tres declaraciones para continuar.',
    'terms.error.save': 'No se pudo guardar tu aceptación. Intenta de nuevo.',
    'terms.version': 'Términos v{version}',
    'terms.updated.eyebrow': 'TÉRMINOS ACTUALIZADOS',
    'terms.updated.title': 'Los Términos de Uso Personal han sido actualizados',
    'terms.updated.body':
      'Actualizamos los Términos de Uso Personal de AFEtm Mobile. Revisa los cambios y vuelve a aceptarlos antes de seguir usando la app.',
    'terms.updated.previous': 'Aceptado antes: v{previous}',
    'terms.updated.new': 'Nueva versión: v{version} · vigente {date}',
    'terms.updated.changelog': 'QUÉ CAMBIÓ',
    'terms.updated.accept': 'Aceptar términos actualizados',

    'inst.eyebrow': 'ACCESO INSTITUCIONAL',
    'inst.title': 'Se requiere acceso institucional',
    'inst.body':
      'Esta funcionalidad solo está disponible mediante una licencia institucional autorizada de WeWon. El uso institucional requiere autorización expresa previa de WeWon Smart Sport Solutions LLC.',
    'inst.what.title': 'QUÉ REQUIERE ACCESO INSTITUCIONAL',
    'inst.what.1': 'Equipos, rosters y dashboards multi-atleta.',
    'inst.what.2': 'Clínicas, universidades, escuelas, clubes y empresas.',
    'inst.what.3': 'Entrenadores, clínicos, docentes e investigadores evaluando a otras personas.',
    'inst.what.4': 'Evaluaciones en lote y registros de atletas de terceros.',
    'inst.contact': 'Solicitar acceso institucional',
    'inst.contact.hint': 'Abre wewonmatrix.com en tu navegador.',
    'inst.footer':
      'La app móvil no puede activar el acceso institucional por sí misma. WeWon Smart Sport Solutions LLC autoriza las licencias institucionales por separado.',
    'inst.openError': 'No se pudo abrir el enlace externo.',

    'profile.license.title': 'Uso Personal Únicamente',
    'profile.license.body':
      'Esta app está licenciada exclusivamente para ti. El uso en equipos, clínico, de investigación o institucional requiere una licencia institucional de WeWon.',
    'profile.license.cta': 'Acceso institucional',

    'error.personalUse.ownership':
      'Regla de uso personal: no puedes acceder a datos que pertenecen a otra persona.',
    'error.personalUse.terms':
      'Debes aceptar los Términos de Uso Personal de AFEtm Mobile para continuar.',
    'error.personalUse.profile':
      'Se requiere un perfil personal antes de crear evaluaciones.',
    'error.personalUse.ageMismatch':
      'La edad de la evaluación no coincide con tu perfil personal. AFEtm Mobile es licencia de uso personal únicamente.',

    'common.next': 'Siguiente',
    'common.back': 'Atrás',
    'common.cancel': 'Cancelar',
    'common.save': 'Guardar',
    'common.retry': 'Reintentar',
    'common.close': 'Cerrar',
    'common.delete': 'Eliminar',
    'common.continue': 'Continuar',
    'common.loading': 'Cargando…',
    'common.pending': 'Pendiente',
    'common.unclassified': 'Sin clasificar',

    'tabs.home': 'Inicio',
    'tabs.new': 'Nuevo',
    'tabs.history': 'Historial',
    'tabs.profile': 'Perfil',

    'home.eyebrow': 'AFE™ SAFETY CHECK',
    'home.greeting': 'Hola',
    'home.badge': 'PREVENTIVO',
    'home.newCheck': 'Nuevo Safety Check',
    'home.lastEval': 'Última evaluación',
    'home.pending.title': 'Pendiente',
    'home.pending.desc':
      'Resultado pendiente de sincronización con el motor oficial AFEtm. Toca para reintentar.',
    'home.emptyTitle': 'Sin evaluaciones previas',
    'home.emptyBody':
      'Realiza tu primer Safety Check para conocer tu estado actual de recuperación cardiovascular.',
    'home.stats.fcp': 'FCP OBJETIVO',
    'home.stats.count': 'EVALUACIONES',
    'home.stats.age': 'EDAD',
    'home.stats.age.unit': 'años',
    'home.stats.fcp.unit': 'bpm',
    'home.trend.title': 'Tendencia semanal',
    'home.trend.subtitle': 'Recuperación (RECpct) — últimas {n} evaluaciones',
    'home.trend.empty': 'Realiza más chequeos para ver tu tendencia.',
    'home.how.title': '¿Cómo funciona?',
    'home.how.1': 'Registra tu Frecuencia Cardiaca en reposo (FCr).',
    'home.how.2': 'Alcanza la FCP objetivo con un esfuerzo controlado.',
    'home.how.3': 'Registra tu FC durante 3 minutos de recuperación.',
    'home.how.4': 'Recibe tu zona AFE y acción preventiva sugerida.',
    'home.disclaimer':
      'Herramienta preventiva. No es una aplicación de diagnóstico médico ni sustituye a un profesional de la salud.',
    'home.meta.pattern': 'Patrón {name}',
    'home.license.eyebrow': 'RECORDATORIO MENSUAL',
    'home.license.title': 'Tienes una licencia Personal',
    'home.license.body':
      'AFEtm Mobile es solo para tu uso personal. El uso institucional o de equipo requiere una licencia WeWon.',
    'home.license.cta': 'Acceso institucional',
    'home.license.dismiss': 'Descartar',
    'paywall.eyebrow': 'AFE™ PERSONAL',
    'paywall.title': 'Acceso completo a AFEtm Safety Check',
    'paywall.subtitle':
      'Chequeos preventivos antes de cada entrenamiento o competencia — la decisión informada empieza aquí.',
    'paywall.trialBadge': '1 MES GRATIS',
    'paywall.benefit.assessments': 'Evaluaciones AFEtm Safety Check ilimitadas',
    'paywall.benefit.history': 'Historial personal y gráficas de detalle',
    'paywall.benefit.compare': 'Comparación de sesiones y tendencias',
    'paywall.benefit.recovery': 'Seguimiento de recuperación y recordatorios',
    'paywall.plan.monthly.title': 'Plan mensual',
    'paywall.plan.monthly.price': '$19.99 / mes',
    'paywall.plan.yearly.title': 'Plan anual',
    'paywall.plan.yearly.price': '$199.99 / año',
    'paywall.plan.yearly.badge': 'MEJOR VALOR',
    'paywall.plan.yearly.save': 'Ahorra {p}% vs mensual',
    'paywall.cta.trial': 'Comenzar 1 Mes Gratis',
    'paywall.cta.monthly': 'Mensual $19.99',
    'paywall.cta.yearly': 'Anual $199.99',
    'paywall.cta.trial.sub': '$0 hoy · Cancela cuando quieras en tu tienda',
    'paywall.disclosure.title': 'QUÉ SUCEDE AL TOCAR “COMENZAR 1 MES GRATIS”',
    'paywall.disclosure.today': '$0 hoy.',
    'paywall.disclosure.renew':
      'Tu suscripción se renueva automáticamente después del mes gratis a menos que la canceles en App Store o Google Play al menos 24 horas antes de que finalice la prueba.',
    'paywall.disclosure.store':
      'El método de pago lo requiere y lo gestiona Apple o Google. AFEtm nunca ve ni guarda datos de tu tarjeta.',
    'paywall.manage': 'Gestionar suscripción',
    'paywall.restore': 'Restaurar compras',
    'paywall.legal.tool':
      'AFEtm Safety Check es una herramienta preventiva y educativa, no clínica.',
    'paywall.legal.renew':
      'La suscripción se renueva automáticamente salvo cancelación desde la tienda correspondiente.',
    'paywall.error.trial': 'No se pudo iniciar la prueba gratuita.',
    'paywall.error.purchase': 'No se pudo completar la compra.',
    'paywall.error.restore': 'No se pudieron restaurar las compras.',
    'paywall.trialUsed':
      'La prueba gratuita ya se usó en este dispositivo. Elige un plan para continuar.',
    'paywall.success.trial': '¡Prueba gratuita activada! Disfruta tu acceso.',
    'paywall.success.purchase': 'Suscripción activa. ¡Gracias!',
    'paywall.dismiss': 'Ahora no',

    'manage.title': 'Gestionar suscripción',
    'manage.status': 'ESTADO',
    'manage.status.trial': 'Prueba gratuita',
    'manage.status.active': 'Activa',
    'manage.status.expired': 'Expirada',
    'manage.status.none': 'Sin plan activo',
    'manage.plan': 'PLAN',
    'manage.plan.monthly': 'Mensual · $19.99 / mes',
    'manage.plan.yearly': 'Anual · $199.99 / año',
    'manage.plan.trial': 'Prueba gratuita (1 mes)',
    'manage.plan.none': '—',
    'manage.expires': 'RENOVACIÓN / EXPIRA',
    'manage.expires.none': '—',
    'manage.expires.in': 'En {n} días',
    'manage.expires.past': 'Expirado',
    'manage.cancel': 'Cancelar suscripción',
    'manage.cancel.hint':
      'Al cancelar aquí registramos tu intención — la cancelación real se hace en la tienda donde te suscribiste.',
    'manage.canceled.badge': 'Cancelada',
    'manage.canceled.body':
      'Cancelaste el {date}. El acceso continúa hasta {expires}.',
    'manage.restore': 'Restaurar compras',
    'manage.legal':
      'La suscripción se renueva automáticamente salvo cancelación desde la tienda correspondiente (App Store o Google Play).',
    'manage.upgrade': 'Cambiar plan',
    'manage.pill.expiresAt': 'Hasta {date}',

    'profile.subscription.title': 'Gestionar suscripción',
    'profile.subscription.body': 'Plan, renovación y cancelación.',

    'home.subscription.gate.title': 'Se requiere suscripción',
    'home.subscription.gate.body':
      'Tu prueba gratuita finalizó. Elige un plan para seguir realizando AFE™ Safety Checks.',
    'home.subscription.gate.cta': 'Ver planes',
    'home.subscription.gate.trialCta': 'Iniciar prueba gratis de 1 mes',
    'home.subscription.trial.pill': '{n} días restantes de prueba',
    'home.subscription.active.pill': 'Plan activo',

    'new.eyebrow': 'NUEVO SAFETY CHECK',
    'new.title': 'Elige el modo',
    'new.subtitle':
      'Realiza tu chequeo AFE™ usando un pulsómetro Bluetooth (recomendado) o ingresando los valores manualmente.',
    'new.guided.title': 'Guiado con pulsómetro',
    'new.guided.desc':
      'Conecta un monitor de pulso Bluetooth compatible (perfil HR 0x180D). Registra FCr en vivo, alcanza la FCP y captura la ventana de 3 min con promedios anti-ruido de 5 s.',
    'new.guided.badge': 'RECOMENDADO',
    'new.step.scan': 'Escanear',
    'new.step.connect': 'Conectar',
    'new.step.rhr': 'FCr',
    'new.step.fcp': 'FCP',
    'new.step.recovery': 'Recuperación',
    'new.manual.title': 'Manual',
    'new.manual.desc':
      'Ingresa manualmente FCr y las lecturas de la ventana de recuperación. Útil si no tienes un pulsómetro compatible.',
    'new.web.warning':
      'El modo Guiado requiere Bluetooth Low Energy nativo y no funciona en la vista previa web ni en Expo Go. Genera un build de iOS/Android para probarlo.',
    'new.ble.disclaimer.title': 'Compatibilidad Bluetooth',
    'new.ble.disclaimer.body':
      'La compatibilidad, el emparejamiento y la calidad de lectura de cualquier pulsómetro BLE dependen del fabricante y de tu dispositivo — no de AFEtm. WeWon Smart Sport Solutions LLC no es responsable del hardware Bluetooth de terceros.',

    'history.eyebrow': 'REGISTRO',
    'history.title': 'Historial',
    'history.compare': 'Comparar',
    'history.exit': 'Salir',
    'history.filter.all': 'Todas',
    'history.empty.title': 'No hay historial disponible',
    'history.empty.body':
      'Realiza tu primer Safety Check y tus evaluaciones aparecerán aquí.',
    'history.compare.selectTwo': 'Selecciona 2 evaluaciones',
    'history.compare.selectOne': 'Selecciona 1 más',
    'history.compare.ready': '2 evaluaciones seleccionadas',
    'history.meta.rec': 'Rec {value}%',

    'compare.title': 'Comparar',
    'compare.eyebrow': 'SESIONES',
    'compare.heading': 'Curvas superpuestas',
    'compare.section.deltas': 'DIFERENCIAS (B − A)',
    'compare.footer':
      'RECpct y HRR más altos indican mejor recuperación; τ (tau) más bajo indica una cinética más rápida.',
    'compare.session.a': 'A · Anterior',
    'compare.session.b': 'B · Reciente',
    'compare.error.title': 'Comparación no disponible',
    'compare.error.select': 'Selecciona exactamente dos evaluaciones.',

    'setup.eyebrow': 'PASO 1 DE 1',
    'setup.title': 'Perfil del atleta',
    'setup.subtitle':
      'Ingresa tus datos base. Los usaremos para calcular tu Frecuencia Cardiaca Pico objetivo.',
    'setup.field.name': 'Nombre',
    'setup.field.name.ph': 'Tu nombre',
    'setup.field.age': 'Edad',
    'setup.field.weight': 'Peso (kg)',
    'setup.field.sport': 'Deporte',
    'setup.field.target': 'Zona objetivo (opcional)',
    'setup.field.target.hint':
      'Al alcanzar o superar esta zona en un chequeo, lo celebraremos contigo.',
    'setup.target.none': 'Ninguna',
    'setup.target.green': 'Verde · Favorable',
    'setup.target.blue': 'Azul · Óptimo',
    'setup.error.name': 'Ingresa tu nombre.',
    'setup.error.age': 'Edad debe ser entre 10 y 90.',
    'setup.error.weight': 'Peso debe ser entre 20 y 250 kg.',
    'setup.error.athleteId':
      'El athleteId AFEtm debe ser un número positivo. Déjalo vacío si aún no lo tienes.',
    'setup.error.save': 'No se pudo guardar el perfil.',
    'setup.save': 'Guardar perfil',
    'setup.field.athleteId': 'AFEtm athleteId',
    'setup.field.athleteId.ph': 'ej. 1024',
    'setup.field.athleteId.hint':
      'Identificador numérico entregado por WeWon Smart Sport Solutions LLC. Obligatorio antes de realizar una evaluación. AFEtm nunca inventa identificadores.',
    'sport.running': 'Running',
    'sport.cycling': 'Ciclismo',
    'sport.football': 'Fútbol',
    'sport.crossfit': 'CrossFit',
    'sport.swimming': 'Natación',
    'sport.other': 'Otro',

    'profile.eyebrow': 'ATLETA',
    'profile.title': 'Perfil',
    'profile.edit': 'Editar perfil',
    'profile.reminders': 'Recordatorios de chequeo',
    'profile.target.blue': 'Objetivo: Zona Azul',
    'profile.target.green': 'Objetivo: Zona Verde',
    'profile.stat.age': 'EDAD',
    'profile.stat.age.unit': 'años',
    'profile.stat.weight': 'PESO',
    'profile.stat.weight.unit': 'kg',
    'profile.stat.fcp': 'FCP OBJETIVO',
    'profile.stat.fcp.unit': 'bpm',
    'profile.about.title': 'Acerca de AFE™ Safety Check',
    'profile.about.body':
      'AFEtm (Alarma de Afectación Fisiológica Temprana) es un protocolo preventivo de apoyo a decisiones que evalúa la recuperación cardiaca durante un esfuerzo controlado.',
    'profile.about.b1': 'Apoya la toma de decisiones preventivas.',
    'profile.about.b2': 'No es una aplicación de diagnóstico médico.',
    'profile.about.b3': 'No sustituye la evaluación profesional.',
    'profile.empty': 'Sin perfil',
    'profile.create': 'Crear perfil',
    'profile.language.section': 'IDIOMA',
    'profile.language.en': 'English',
    'profile.language.es': 'Español',
    'profile.language.hint':
      'Cambia toda la aplicación entre 100% inglés y 100% español.',

    'reminders.title': 'Recordatorios',
    'reminders.eyebrow': 'HÁBITO PREVENTIVO',
    'reminders.heading': 'Programa tus chequeos',
    'reminders.subtitle':
      'Recibe una notificación local antes de tus sesiones exigentes. Ideal justo antes de tu ventana habitual de entrenamiento.',
    'reminders.perm.blocked':
      'Notificaciones no permitidas. Habilítalas en Ajustes del sistema para poder recibir los recordatorios.',
    'reminders.section.active': 'ACTIVOS',
    'reminders.section.new': 'NUEVO',
    'reminders.empty': 'No hay recordatorios activos.',
    'reminders.field.label': 'Etiqueta',
    'reminders.field.label.default': 'Chequeo antes de entrenar',
    'reminders.field.label.ph': 'Chequeo antes de entrenar',
    'reminders.field.time': 'Hora',
    'reminders.field.days': 'Días',
    'reminders.days.pick': 'Selecciona días',
    'reminders.error.days': 'Selecciona al menos un día.',
    'reminders.error.save': 'No se pudo crear el recordatorio.',
    'reminders.create': 'Crear recordatorio',
    'weekday.short.1': 'D',
    'weekday.short.2': 'L',
    'weekday.short.3': 'M',
    'weekday.short.4': 'M',
    'weekday.short.5': 'J',
    'weekday.short.6': 'V',
    'weekday.short.7': 'S',
    'weekday.long.1': 'Domingo',
    'weekday.long.2': 'Lunes',
    'weekday.long.3': 'Martes',
    'weekday.long.4': 'Miércoles',
    'weekday.long.5': 'Jueves',
    'weekday.long.6': 'Viernes',
    'weekday.long.7': 'Sábado',

    'assess.step': 'PASO {n} DE {total}',
    'assess.rhr.title': 'Frecuencia Cardiaca en Reposo',
    'assess.rhr.body':
      'Antes de esforzarte, registra tu FC en reposo (idealmente sentado y en calma por 2 minutos).',
    'assess.rhr.range': 'Rango típico 40–90 bpm',
    'assess.fcp.title': 'Frecuencia Cardiaca Pico objetivo',
    'assess.fcp.body':
      'Meta de esfuerzo calculada a partir de tu edad. Alcánzala con un esfuerzo controlado antes de iniciar la ventana de recuperación.',
    'assess.fcp.label': 'FCP OBJETIVO',
    'assess.fcp.tip':
      'Cuando alcances la FCP, detén el esfuerzo y comienza a registrar tu FC según el cronograma del siguiente paso.',
    'assess.readings.title': 'Ventana de recuperación',
    'assess.readings.body':
      'Registra tu FC en los siguientes intervalos (segundos desde el fin del esfuerzo).',
    'assess.readings.hint':
      't=0s es tu FC al alcanzar la FCP. t=180s es tu FC a los 3 minutos.',
    'assess.context.title': 'Entrevista Contextual AFEtm',
    'assess.context.body':
      'Selecciona los factores que te aplican ahora. Es obligatorio para el motor oficial AFEtm antes de cada evaluación.',
    'assess.context.notes': 'Notas (opcional)',
    'assess.context.notes.ph':
      'Cualquier otro detalle que el motor AFEtm deba conocer (máximo 2.000 caracteres).',
    'assess.context.notes.count': '{n} / 2000',
    'assess.context.none.hint': 'Al tocar “Ninguno” se limpian los demás factores.',
    'assess.factor.illness': 'Enfermedad reciente o actual',
    'assess.factor.sleep': 'Sueño deficiente',
    'assess.factor.training': 'Carga de entrenamiento reciente elevada',
    'assess.factor.dehydration': 'Hidratación deficiente',
    'assess.factor.medication': 'Uso de medicación',
    'assess.factor.pain': 'Dolor o molestia',
    'assess.factor.stimulants': 'Estimulantes (cafeína / bebidas energéticas)',
    'assess.factor.none': 'Sin factores contextuales relevantes',
    'assess.submit': 'Calcular resultado',
    'assess.error.rhr': 'FCr debe estar entre 30 y 130 bpm.',
    'assess.error.reading': 'Lectura t={t}s debe estar entre 40 y 230 bpm.',
    'assess.error.peak': 'La FC pico (t=0s) debe estar cerca de la FCP objetivo ({fcp}).',
    'assess.error.factors':
      'Selecciona al menos un factor contextual AFEtm para continuar. Usa “Ninguno” si no aplica ninguno.',
    'assess.error.athleteId':
      'Tu perfil no tiene un athleteId AFEtm. Agrégalo en Perfil antes de realizar una evaluación. AFEtm nunca inventa identificadores.',
    'assess.error.upstream':
      'Servidor autoritativo AFEtm rechazó la solicitud (HTTP {status}). Detalle: {body}. La evaluación NO se guardó.',
    'assess.error.generic': 'No se pudo calcular la evaluación.',

    'fcpv.q.sleep': 'Sueño la noche anterior',
    'fcpv.q.sleep.hint': '¿Cómo dormiste?',
    'fcpv.q.sleep.0': 'Bien (7-9 h)',
    'fcpv.q.sleep.1': 'Regular',
    'fcpv.q.sleep.2': 'Mal / poco',
    'fcpv.q.hydration': 'Hidratación',
    'fcpv.q.hydration.hint': '¿Cómo estás hidratado hoy?',
    'fcpv.q.hydration.0': 'Adecuada',
    'fcpv.q.hydration.1': 'Baja',
    'fcpv.q.hydration.2': 'Muy baja',
    'fcpv.q.symptoms': 'Síntomas actuales',
    'fcpv.q.symptoms.hint': 'Mareo, palpitaciones, fatiga inusual',
    'fcpv.q.symptoms.0': 'Ninguno',
    'fcpv.q.symptoms.1': 'Leves',
    'fcpv.q.symptoms.2': 'Notables',
    'fcpv.q.recent_illness': 'Enfermedad reciente',
    'fcpv.q.recent_illness.hint': 'Últimos 14 días',
    'fcpv.q.recent_illness.0': 'No',
    'fcpv.q.recent_illness.1': 'Leve',
    'fcpv.q.recent_illness.2': 'Sí',
    'fcpv.q.subjective_load': 'Carga subjetiva',
    'fcpv.q.subjective_load.hint': 'Percepción del esfuerzo previo',
    'fcpv.q.subjective_load.0': 'Baja',
    'fcpv.q.subjective_load.1': 'Moderada',
    'fcpv.q.subjective_load.2': 'Alta',

    'guided.title': 'Guiado con BLE',
    'guided.phase.scan': 'Buscando pulsómetro',
    'guided.phase.connect': 'Conectando',
    'guided.phase.ready': 'Listo',
    'guided.phase.fcr': 'Registrar FCr',
    'guided.phase.fcp': 'Alcanzar FCP',
    'guided.phase.recovery': 'Recuperación 3 min',
    'guided.phase.submit': 'Calculando',
    'guided.phase.error': 'Error',
    'guided.unsupported.title': 'BLE no disponible en este entorno',
    'guided.unsupported.web':
      'La vista previa web no soporta Bluetooth Low Energy. Escanea el QR de Expo o genera un build nativo para usar el modo Guiado.',
    'guided.unsupported.native':
      'Expo Go no incluye react-native-ble-plx. Genera un build de desarrollo (Publish → Generate iOS/Android build) para probarlo.',
    'guided.unsupported.cta': 'Usar modo manual',
    'guided.live.label': 'FRECUENCIA EN VIVO',
    'guided.live.active': 'Señal activa desde el pulsómetro.',
    'guided.live.idle': 'Esperando señal del pulsómetro…',
    'guided.devices': 'DISPOSITIVOS',
    'guided.scan': 'Buscar',
    'guided.scanning': 'Buscando pulsómetros compatibles (perfil HR 0x180D)…',
    'guided.no.devices':
      'No se encontraron pulsómetros. Asegúrate de que esté encendido y en modo emparejamiento.',
    'guided.connecting.title': 'Conectando…',
    'guided.connecting.body': 'Estableciendo conexión con el pulsómetro.',
    'guided.ready.title': 'Pulsómetro conectado',
    'guided.ready.body':
      'Ponte cómodo y en calma. En el siguiente paso registraremos tu Frecuencia Cardiaca en Reposo (FCr).',
    'guided.fcr.title': 'Registra tu FCr',
    'guided.fcr.body':
      'Siéntate y respira con calma durante ~1 minuto. Cuando tu FC en vivo esté estable, presiona Registrar. Promediaremos los últimos 15 s automáticamente.',
    'guided.fcr.register': 'Registrar FCr',
    'guided.fcr.error':
      'No se pudo registrar FCr. Mantén la calma y espera unos segundos.',
    'guided.fcp.title': 'Alcanza tu FCP objetivo',
    'guided.fcp.body':
      'Realiza un esfuerzo controlado hasta acercarte a la meta. Cuando la alcances, detén el esfuerzo y presiona Iniciar recuperación.',
    'guided.fcp.rhr': 'FCr',
    'guided.fcp.target': 'FCP OBJETIVO',
    'guided.fcp.live': 'EN VIVO',
    'guided.fcp.start': 'Iniciar recuperación',
    'guided.fcp.error': 'Alcanza al menos ~{n} bpm antes de iniciar la recuperación.',
    'guided.recovery.captures': 'CAPTURAS AUTOMÁTICAS',
    'guided.recovery.captures.hint':
      'Cada checkpoint promedia los últimos 5 s para eliminar ruido de señal.',
    'guided.recovery.peak': 't=0s (Pico)',
    'guided.submit.title': 'Calculando resultado…',
    'guided.submit.body': 'Estamos analizando tu curva de recuperación.',
    'guided.error.title': 'Error',
    'guided.error.retry': 'Reintentar',
    'guided.error.default': 'Ocurrió un problema. Intenta de nuevo.',
    'guided.perm.title': 'Permisos requeridos',
    'guided.perm.body':
      'Concede acceso a Bluetooth para poder detectar tu pulsómetro.',
    'guided.perm.retry': 'Reintentar permisos',
    'guided.reconnect':
      'Reconectando con el pulsómetro… El cronómetro sigue activo. Intento {n}.',
    'guided.pill.scanning': 'Escaneando…',
    'guided.pill.disconnected': 'Sin conexión',
    'guided.pill.reconnecting': 'Reconectando… ({n})',

    'detail.title': 'Resultado',
    'detail.notFound': 'Evaluación no encontrada',
    'detail.back': 'Volver',
    'detail.section.metrics': 'Métricas de recuperación',
    'detail.section.reference': 'Datos de referencia',
    'detail.section.readings': 'Lecturas por checkpoint',
    'detail.section.context': 'Contexto preventivo (FCPv)',
    'detail.section.chart': 'Curva de recuperación',
    'detail.zone.eyebrow': 'ZONA AFE',
    'detail.chip.pattern': 'PATRÓN',
    'detail.chip.action': 'ACCIÓN',
    'detail.pending.eyebrow': 'ESTADO',
    'detail.pending.title': 'Pendiente de sincronización',
    'detail.pending.desc':
      'Resultado pendiente de sincronización con el motor oficial AFEtm.',
    'detail.pending.hint':
      'Las mediciones fueron guardadas correctamente. La zona (Azul / Verde / Amarillo / Rojo) sólo se muestra cuando el servidor autoritativo la clasifica.',
    'detail.resync': 'Reintentar sincronización',
    'detail.resync.error': 'No se pudo reintentar la sincronización.',
    'detail.celebrate': '¡Alcanzaste tu zona objetivo! Excelente recuperación.',
    'detail.metric.hrr.hint': 'Caída 1 min',
    'detail.metric.recpct.hint': 'Recuperación 3 min',
    'detail.metric.aurc.hint': 'Área bajo curva',
    'detail.metric.tau.hint': 'Cinética',
    'detail.ref.rhr': 'FCr',
    'detail.ref.peak': 'FC pico',
    'detail.ref.fcp': 'FCP objetivo',
    'detail.ref.age': 'Edad',
    'detail.ref.age.unit': 'años',
    'detail.fcpv.sleep': 'Sueño',
    'detail.fcpv.hydration': 'Hidratación',
    'detail.fcpv.symptoms': 'Síntomas',
    'detail.fcpv.illness': 'Enfermedad reciente',
    'detail.fcpv.load': 'Carga subjetiva',
    'detail.fcpv.total': 'TOTAL',
    'detail.contextFlag':
      'Contexto elevado. Considera atenuar la carga aun si la zona calculada es favorable.',
    'detail.disclaimer':
      'No es una aplicación de diagnóstico médico. AFE™ Safety Check apoya decisiones preventivas y no sustituye la evaluación profesional. Ante síntomas preocupantes, detén la actividad y sigue los protocolos de seguridad correspondientes.',
    'detail.delete.confirm':
      '¿Eliminar esta evaluación? Esta acción no se puede deshacer.',
    'detail.home': 'Volver al inicio',
    'detail.share.web':
      'La exportación no está disponible en la vista previa web. Prueba en Expo Go o en el build nativo.',
    'detail.share.error': 'No se pudo compartir el resultado.',
    'detail.share.unavailable': 'Compartir no está disponible en este dispositivo.',
    'detail.share.prepareErr': 'No se pudo preparar la imagen.',
    'detail.share.title': 'Compartir resultado AFE™',

    'guide.eyebrow': 'GUÍA VISUAL AFE™',
    'guide.title': 'Interpretación por color',
    'guide.subtitle':
      'Resumen simple y claro de lo que significa cada color para tu próxima decisión de entrenamiento.',
    'guide.footer': '¿QUÉ SIGNIFICA ESTA GUÍA?',
    'guide.h1': 'Apoya la toma de decisiones preventivas.',
    'guide.h2': 'No es una aplicación de diagnóstico médico.',
    'guide.h3': 'Debe interpretarse junto con el contexto del atleta.',
    'guide.action.BLUE': 'Continuar',
    'guide.action.GREEN': 'Observar',
    'guide.action.YELLOW': 'Ajustar',
    'guide.action.RED': 'Detener la carga intensa y reevaluar',
    'guide.explanation.BLUE': 'Tu recuperación cardiaca hoy se ve excelente.',
    'guide.explanation.GREEN': 'Tu recuperación cardiaca hoy se ve favorable.',
    'guide.explanation.YELLOW': 'Tu recuperación cardiaca hoy muestra señales de precaución.',
    'guide.explanation.RED': 'Tu recuperación cardiaca hoy se ve comprometida.',
    'guide.recommendation.BLUE':
      'Continúa con tu sesión planificada como de costumbre.',
    'guide.recommendation.GREEN':
      'Continúa normalmente, atento a cómo te sientes.',
    'guide.recommendation.YELLOW':
      'Reduce la carga, alarga el calentamiento y la recuperación, y vuelve a chequear.',
    'guide.recommendation.RED':
      'Evita esfuerzos intensos. Descansa, sigue el protocolo de seguridad y reevalúa antes de continuar.',

    'zone.BLUE.label': 'Azul · Óptimo',
    'zone.GREEN.label': 'Verde · Favorable',
    'zone.YELLOW.label': 'Amarillo · Precaución',
    'zone.RED.label': 'Rojo · Alerta',
    'zone.BLUE.short': 'AZUL',
    'zone.GREEN.short': 'VERDE',
    'zone.YELLOW.short': 'AMARILLO',
    'zone.RED.short': 'ROJO',
    'zone.BLUE.desc':
      'Estado muy favorable. Recuperación cardiaca excelente y respuesta positiva general.',
    'zone.GREEN.desc':
      'Estado favorable. Condición adecuada para entrenar o continuar normalmente.',
    'zone.YELLOW.desc':
      'Estado de precaución. Observa el contexto y ajusta la carga si es necesario.',
    'zone.RED.desc':
      'Estado de alerta. Considera revisión profesional antes de esfuerzos exigentes.',

    'pattern.RAPID': 'Rápida',
    'pattern.NORMAL': 'Normal',
    'pattern.DELAYED': 'Lenta',
    'pattern.FLATTENED': 'Meseta',
    'pattern.UNSTABLE': 'Inestable',
  },
} as const;

type Key = keyof typeof dict.en;

type I18nCtx = {
  lang: Lang;
  setLang: (l: Lang) => Promise<void>;
  toggle: () => Promise<void>;
  t: (k: Key, params?: Record<string, string | number>) => string;
  ready: boolean;
  // Locale helpers
  formatDate: (iso: string, opts?: Intl.DateTimeFormatOptions) => string;
  formatTime: (iso: string) => string;
  formatDateTime: (iso: string) => string;
};

const Ctx = createContext<I18nCtx | null>(null);

function detectInitial(): Lang {
  try {
    const locales = Localization.getLocales?.();
    const raw = (locales && locales[0]?.languageCode) || 'en';
    return raw?.toLowerCase().startsWith('es') ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as Lang | null;
      if (stored === 'en' || stored === 'es') {
        setLangState(stored);
      } else {
        setLangState(detectInitial());
      }
      setReady(true);
    })();
  }, []);

  const setLang = useCallback(async (l: Lang) => {
    await AsyncStorage.setItem(STORAGE_KEY, l);
    setLangState(l);
  }, []);

  const toggle = useCallback(async () => {
    const next: Lang = lang === 'en' ? 'es' : 'en';
    await setLang(next);
  }, [lang, setLang]);

  const t = useCallback(
    (k: Key, params?: Record<string, string | number>) => {
      const s: string = (dict[lang][k] as string) ?? (dict.en[k] as string) ?? k;
      if (!params) return s;
      return Object.keys(params).reduce(
        (acc, key) => acc.replace(new RegExp(`\\{${key}\\}`, 'g'), String(params[key])),
        s
      );
    },
    [lang]
  );

  const locale = lang === 'es' ? 'es-ES' : 'en-US';

  const formatDate = useCallback(
    (iso: string, opts?: Intl.DateTimeFormatOptions) => {
      const d = new Date(iso);
      return d.toLocaleDateString(locale, opts ?? {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    },
    [locale]
  );

  const formatTime = useCallback(
    (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    [locale]
  );

  const formatDateTime = useCallback(
    (iso: string) => `${formatDate(iso)} · ${formatTime(iso)}`,
    [formatDate, formatTime]
  );

  const value = useMemo(
    () => ({ lang, setLang, toggle, t, ready, formatDate, formatTime, formatDateTime }),
    [lang, setLang, toggle, t, ready, formatDate, formatTime, formatDateTime]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useI18n must be used inside I18nProvider');
  return c;
}

/**
 * Localized zone/pattern helpers. Import and call with the current `t`.
 * Kept as free functions so they can be used inside any component/screen.
 */
export function zoneLabelI18n(
  t: I18nCtx['t'],
  z: 'BLUE' | 'GREEN' | 'YELLOW' | 'RED'
): string {
  return t(`zone.${z}.label` as Key);
}
export function zoneShortI18n(
  t: I18nCtx['t'],
  z: 'BLUE' | 'GREEN' | 'YELLOW' | 'RED'
): string {
  return t(`zone.${z}.short` as Key);
}
export function zoneDescI18n(
  t: I18nCtx['t'],
  z: 'BLUE' | 'GREEN' | 'YELLOW' | 'RED'
): string {
  return t(`zone.${z}.desc` as Key);
}
export function patternLabelI18n(
  t: I18nCtx['t'],
  p: 'RAPID' | 'NORMAL' | 'DELAYED' | 'FLATTENED' | 'UNSTABLE'
): string {
  return t(`pattern.${p}` as Key);
}
