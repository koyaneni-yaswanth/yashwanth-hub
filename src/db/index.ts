import Dexie, { type Table } from 'dexie';
import type {
  Task,
  EventItem,
  Meeting,
  TravelRecord,
  Note,
  Expense,
  Contact,
  DocumentItem,
  Area,
  AppSetting,
  SyncQueueItem,
  Project,
  AppNotification,
  AIUsageLog,
  GmailFollowUpItem,
  GooglePhotoItem,
  SyncHistoryRecord,
  DeviceSession,
  GoogleTaskItem,
  NeoMemory,
  NeoSyncAuditRecord,
} from '../types';
import { generateId, getTodayISO } from '../lib/utils';

export class YashwanthHubDatabase extends Dexie {
  tasks!: Table<Task, string>;
  events!: Table<EventItem, string>;
  meetings!: Table<Meeting, string>;
  travel!: Table<TravelRecord, string>;
  notes!: Table<Note, string>;
  expenses!: Table<Expense, string>;
  contacts!: Table<Contact, string>;
  documents!: Table<DocumentItem, string>;
  areas!: Table<Area, string>;
  settings!: Table<AppSetting, string>;
  sync_queue!: Table<SyncQueueItem, string>;
  projects!: Table<Project, string>;
  notifications!: Table<AppNotification, string>;
  ai_logs!: Table<AIUsageLog, string>;
  gmail_messages!: Table<GmailFollowUpItem, string>;
  photos_media!: Table<GooglePhotoItem, string>;
  sync_history!: Table<SyncHistoryRecord, string>;
  device_sessions!: Table<DeviceSession, string>;
  google_tasks!: Table<GoogleTaskItem, string>;
  neo_memories!: Table<NeoMemory, string>;
  neo_sync_audit!: Table<NeoSyncAuditRecord, string>;

  constructor() {
    super('YashwanthHubDB');
    this.version(1).stores({
      tasks: 'id, text, area, priority, due_date, starred, done, created_at',
      events: 'id, title, date, kind, area, created_at',
      meetings: 'id, title, date, area, status, created_at',
      travel: 'id, destination, start_date, end_date, area, status, created_at',
      notes: 'id, title, pinned, area, created_at',
      expenses: 'id, amount, category, area, date, created_at',
      contacts: 'id, name, company, area, created_at',
      documents: 'id, title, file_name, area, created_at',
      areas: 'id, name, created_at',
      settings: 'key, updated_at',
      sync_queue: 'id, table_name, record_id, created_at',
    });

    this.version(2).stores({
      projects: 'id, title, area, status, priority, target_date, created_at',
      notifications: 'id, type, priority, read, created_at',
      ai_logs: 'id, provider, modelId, timestamp',
    });

    this.version(3).stores({
      gmail_messages: 'id, threadId, from, subject, date, status',
      photos_media: 'id, mediaItemId, filename, mimeType, project_id, selectedAt',
      sync_history: 'id, service, status, timestamp',
      device_sessions: 'id, deviceName, platform, isCurrent, lastActive',
      google_tasks: 'id, title, status, due, listId, hubTaskId, updated',
    });

    this.version(4).stores({
      neo_memories: 'id, originalNeoId, title, source, platform, capturedAt, associatedProjectId, associatedArea, associatedGoogleEventId, importedAt',
      neo_sync_audit: 'id, timestamp, method, status',
    });
  }
}

export const db = new YashwanthHubDatabase();

export const DEFAULT_AREAS = [
  { name: 'PAWAN SHAKTI', color: '#0b6e6e', description: 'Small wind turbine innovation & TRL development' },
  { name: 'MG Automation', color: '#2563eb', description: 'Industrial automation & motion engineering' },
  { name: 'IvLabs', color: '#7c3aed', description: 'Robotics & autonomous systems research' },
  { name: 'Waffle Whizz', color: '#d97706', description: 'Retail food enterprise operations' },
  { name: 'Personal', color: '#059669', description: 'Health, personal development & finances' },
];

export async function initializeDatabase() {
  try {
    const areaCount = await db.areas.count();
    if (areaCount === 0) {
      const now = new Date().toISOString();
      const areasToInsert: Area[] = DEFAULT_AREAS.map((a) => ({
        id: generateId(),
        name: a.name,
        color: a.color,
        description: a.description,
        created_at: now,
        updated_at: now,
      }));
      await db.areas.bulkAdd(areasToInsert);
    }

    // Seed projects if empty
    const projectCount = await db.projects.count();
    if (projectCount === 0) {
      await seedProjects();
    }

    // Seed sample notifications if empty
    const notifCount = await db.notifications.count();
    if (notifCount === 0) {
      await seedNotifications();
    }

    // Check for legacy localStorage migration from "yash-hub-v1"
    const legacyKey = 'yash-hub-v1';
    const legacyRaw = typeof window !== 'undefined' ? localStorage.getItem(legacyKey) : null;
    const migrationDone = await db.settings.get('legacy_migrated');

    if (legacyRaw && !migrationDone) {
      try {
        const legacy = JSON.parse(legacyRaw);
        const now = new Date().toISOString();

        if (Array.isArray(legacy.tasks) && legacy.tasks.length > 0) {
          const importedTasks: Task[] = legacy.tasks.map((t: any) => ({
            id: t.id || generateId(),
            text: t.text || 'Untitled Task',
            area: t.area || 'Personal',
            priority: t.star ? 'high' : 'medium',
            due_date: t.due || undefined,
            starred: Boolean(t.star),
            done: Boolean(t.done),
            plan: t.plan || undefined,
            created_at: now,
            updated_at: now,
          }));
          await db.tasks.bulkPut(importedTasks);
        }

        if (Array.isArray(legacy.events) && legacy.events.length > 0) {
          const importedEvents: EventItem[] = legacy.events.map((e: any) => ({
            id: e.id || generateId(),
            title: e.title || 'Untitled Event',
            date: e.date || getTodayISO(),
            start_time: e.time || undefined,
            kind: e.kind || 'Meeting',
            place: e.place || undefined,
            area: 'Personal',
            created_at: now,
            updated_at: now,
          }));
          await db.events.bulkPut(importedEvents);
        }

        if (Array.isArray(legacy.notes) && legacy.notes.length > 0) {
          const importedNotes: Note[] = legacy.notes.map((n: any) => ({
            id: n.id || generateId(),
            title: n.title || 'Note',
            body: n.body || '',
            pinned: Boolean(n.pin),
            area: 'PAWAN SHAKTI',
            created_at: now,
            updated_at: now,
          }));
          await db.notes.bulkPut(importedNotes);
        }

        if (Array.isArray(legacy.exp) && legacy.exp.length > 0) {
          const importedExpenses: Expense[] = legacy.exp.map((x: any) => ({
            id: x.id || generateId(),
            amount: Number(x.amt) || 0,
            category: x.cat || 'Business',
            area: 'PAWAN SHAKTI',
            note: x.note || '',
            date: x.date || getTodayISO(),
            created_at: now,
            updated_at: now,
          }));
          await db.expenses.bulkPut(importedExpenses);
        }

        if (Array.isArray(legacy.people) && legacy.people.length > 0) {
          const importedContacts: Contact[] = legacy.people.map((p: any) => ({
            id: p.id || generateId(),
            name: p.name || '',
            role: p.role || '',
            phone: p.contact?.includes('@') ? undefined : p.contact,
            email: p.contact?.includes('@') ? p.contact : undefined,
            area: 'PAWAN SHAKTI',
            note: p.note || '',
            created_at: now,
            updated_at: now,
          }));
          await db.contacts.bulkPut(importedContacts);
        }

        await db.settings.put({
          key: 'legacy_migrated',
          value: true,
          updated_at: now,
        });
      } catch (err) {
        console.error('Failed to migrate legacy localStorage data:', err);
      }
    } else {
      // Seed initial sample data if tasks table is completely empty
      const taskCount = await db.tasks.count();
      if (taskCount === 0) {
        await seedStarterData();
      }
    }
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

async function seedProjects() {
  const now = new Date().toISOString();
  const today = getTodayISO();
  const nextMonth = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

  const sampleProjects: Project[] = [
    {
      id: generateId(),
      title: 'Small Wind Turbine TRL 6 Prototype Demonstration',
      description: 'Design freeze, fabrication of axial flux generator, blade aero-pitch testing, and 4-week field validation run.',
      area: 'PAWAN SHAKTI',
      status: 'active',
      priority: 'urgent',
      start_date: today,
      target_date: nextMonth,
      progress: 45,
      milestones: [
        { id: generateId(), title: 'Rotor aerodynamic analysis & NACA 4412 airfoils', target_date: today, done: true },
        { id: generateId(), title: 'Axial flux PM stator coil winding & testing bench', target_date: today, done: true },
        { id: generateId(), title: 'IEC 61400-2 braking caliper and overspeed test', target_date: nextMonth, done: false },
        { id: generateId(), title: 'Customer field pilot installation & LOI signature', target_date: nextMonth, done: false },
      ],
      tags: ['TRL-6', 'Aerodynamics', 'Hardware'],
      created_at: now,
      updated_at: now,
    },
    {
      id: generateId(),
      title: 'Autonomous Mobile Robot (AMR) Visual SLAM Navigation',
      description: 'ROS 2 Humble navigation stack integration with OAK-D spatial depth cameras, IMU sensor fusion, and dynamic obstacle avoidance.',
      area: 'IvLabs',
      status: 'active',
      priority: 'high',
      start_date: today,
      target_date: nextMonth,
      progress: 60,
      milestones: [
        { id: generateId(), title: 'OAK-D stereo camera calibration & point-cloud filtering', target_date: today, done: true },
        { id: generateId(), title: 'Nav2 waypoint follower tuning & costmap recovery', target_date: nextMonth, done: false },
      ],
      tags: ['Robotics', 'ROS2', 'SLAM', 'IvLabs'],
      created_at: now,
      updated_at: now,
    },
    {
      id: generateId(),
      title: 'Industrial PLC Automated Control Cabinet Suite',
      description: '24V DC signal isolation, emergency stop safety relays, client factory commissioning for packaging line.',
      area: 'MG Automation',
      status: 'active',
      priority: 'medium',
      start_date: today,
      target_date: nextMonth,
      progress: 30,
      milestones: [
        { id: generateId(), title: 'Single line wiring diagrams & electrical cabinet CAD', target_date: today, done: true },
        { id: generateId(), title: 'Factory on-site commissioning & safety sign-off', target_date: nextMonth, done: false },
      ],
      tags: ['Automation', 'PLC', 'Industrial'],
      created_at: now,
      updated_at: now,
    },
  ];

  await db.projects.bulkAdd(sampleProjects);
}

async function seedNotifications() {
  const now = new Date().toISOString();
  const sampleNotifications: AppNotification[] = [
    {
      id: generateId(),
      title: 'Upcoming Professor Review Meeting',
      message: 'Professor Lab Review is scheduled today at 14:30. Ensure your power curves and 1-page gap report are prepared.',
      type: 'meeting',
      priority: 'high',
      read: false,
      created_at: now,
    },
    {
      id: generateId(),
      title: 'IEC 61400-2 Safety Register Action Required',
      message: 'Finalize IEC 61400-2 safety risk register for wind rotor braking system today.',
      type: 'deadline',
      priority: 'urgent',
      read: false,
      created_at: now,
    },
    {
      id: generateId(),
      title: 'Jarvis AI Automation Engine Online',
      message: 'Intelligent proactive reminders and local heuristic synthesis active.',
      type: 'system',
      priority: 'low',
      read: true,
      created_at: now,
    },
  ];

  await db.notifications.bulkAdd(sampleNotifications);
}

export async function seedStarterData() {
  const now = new Date().toISOString();
  const today = getTodayISO();

  // Tasks
  const sampleTasks: Task[] = [
    {
      id: generateId(),
      text: 'Finalize IEC 61400-2 safety risk register for wind rotor braking system',
      description: 'Review overspeed protection, mechanical calipers, and emergency resistive dump load.',
      area: 'PAWAN SHAKTI',
      priority: 'high',
      due_date: today,
      starred: true,
      done: false,
      notes: 'Prepare 1-page summary for professor meeting.',
      created_at: now,
      updated_at: now,
    },
    {
      id: generateId(),
      text: 'Inspect PLC control cabinet wiring schematics and emergency stop relays',
      description: 'Check 24V DC bus distribution and signal isolation.',
      area: 'MG Automation',
      priority: 'medium',
      due_date: today,
      starred: false,
      done: false,
      created_at: now,
      updated_at: now,
    },
    {
      id: generateId(),
      text: 'Calibrate OAK-D stereo camera rig and test visual odometry package in ROS 2',
      area: 'IvLabs',
      priority: 'medium',
      due_date: today,
      starred: true,
      done: false,
      created_at: now,
      updated_at: now,
    },
    {
      id: generateId(),
      text: 'Audit weekly ingredient procurement invoices and supplier margins',
      area: 'Waffle Whizz',
      priority: 'low',
      due_date: today,
      starred: false,
      done: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: generateId(),
      text: 'Order custom neodymium N52 arc magnets for axial flux PM generator',
      area: 'PAWAN SHAKTI',
      priority: 'urgent',
      due_date: today,
      starred: true,
      done: false,
      created_at: now,
      updated_at: now,
    },
  ];

  await db.tasks.bulkAdd(sampleTasks);

  // Events
  const sampleEvents: EventItem[] = [
    {
      id: generateId(),
      title: 'Professor Lab Review — TRL 4 to 5 Testing Protocol',
      date: today,
      start_time: '14:30',
      end_time: '15:30',
      kind: 'Meeting',
      place: 'IvLabs Conference Room / Online',
      area: 'PAWAN SHAKTI',
      notes: 'Bring 1-page gap report and power curve data.',
      created_at: now,
      updated_at: now,
    },
    {
      id: generateId(),
      title: 'MG Automation On-site Client Commissioning',
      date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      start_time: '10:00',
      end_time: '13:00',
      kind: 'Meeting',
      place: 'Industrial Zone Phase 2',
      area: 'MG Automation',
      created_at: now,
      updated_at: now,
    },
    {
      id: generateId(),
      title: 'DST Startup Grant First Round Application Deadline',
      date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      start_time: '17:00',
      kind: 'Deadline',
      place: 'National Portal',
      area: 'PAWAN SHAKTI',
      created_at: now,
      updated_at: now,
    },
  ];
  await db.events.bulkAdd(sampleEvents);

  // Meetings
  const sampleMeetings: Meeting[] = [
    {
      id: generateId(),
      title: 'Wind Turbine Aerodynamic Blade Pitch Sync',
      date: today,
      start_time: '11:00',
      end_time: '12:00',
      attendees: 'Dr. Rao, Design Engineer, Yaswanth',
      location_or_link: 'https://meet.google.com/pwn-shkt-hub',
      area: 'PAWAN SHAKTI',
      agenda_and_notes: 'Discuss NACA 4412 airfoil lift-to-drag ratios at low Reynolds numbers (3-5 m/s wind speeds).',
      action_items: 'Run 3D CFD simulation in Ansys Fluent by Friday.',
      status: 'scheduled',
      created_at: now,
      updated_at: now,
    },
  ];
  await db.meetings.bulkAdd(sampleMeetings);

  // Travel
  const sampleTravel: TravelRecord[] = [
    {
      id: generateId(),
      destination: 'Pune / Mumbai Industrial Corridor',
      purpose: 'Vendor evaluation for precision CNC rotor hubs & generator stator laser laminations',
      start_date: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
      end_date: new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10),
      mode: 'Flight',
      booking_reference: '6E-4521',
      area: 'PAWAN SHAKTI',
      cost_estimate: 14500,
      notes_and_itinerary: 'Day 1: Precision stamping vendor. Day 2: Coil winding facility.',
      status: 'booked',
      created_at: now,
      updated_at: now,
    },
  ];
  await db.travel.bulkAdd(sampleTravel);

  // Notes
  const sampleNotes: Note[] = [
    {
      id: generateId(),
      title: '90-Day Wind Startup Target',
      body: 'The TRL scale ends at 9, so there is no TRL 10. In 90 days aim for TRL 5 evidence, a TRL 6 prototype demo and one pilot letter. TRL 7 to 9 needs field data and formal certification.',
      area: 'PAWAN SHAKTI',
      pinned: true,
      tags: ['TRL', 'Roadmap', 'PawanShakti'],
      created_at: now,
      updated_at: now,
    },
    {
      id: generateId(),
      title: 'Generator Testing Bench Architecture',
      body: 'Dual-rotor axial flux permanent magnet generator. Measure open-circuit voltage at 100-500 RPM. Use 3-phase rectifier and variable resistor load bank to plot IV curves.',
      area: 'PAWAN SHAKTI',
      pinned: true,
      tags: ['Hardware', 'R&D'],
      created_at: now,
      updated_at: now,
    },
  ];
  await db.notes.bulkAdd(sampleNotes);

  // Expenses
  const sampleExpenses: Expense[] = [
    {
      id: generateId(),
      amount: 8500,
      category: 'Parts',
      area: 'PAWAN SHAKTI',
      note: 'Laser cut electrical steel laminations for stator core',
      date: today,
      created_at: now,
      updated_at: now,
    },
    {
      id: generateId(),
      amount: 3200,
      category: 'Equipment',
      area: 'IvLabs',
      note: 'Digital tachometer and vibration sensor probe',
      date: today,
      created_at: now,
      updated_at: now,
    },
    {
      id: generateId(),
      amount: 1450,
      category: 'Food',
      area: 'Personal',
      note: 'Team sprint lunch and refreshments',
      date: today,
      created_at: now,
      updated_at: now,
    },
  ];
  await db.expenses.bulkAdd(sampleExpenses);

  // Contacts
  const sampleContacts: Contact[] = [
    {
      id: generateId(),
      name: 'Dr. K. S. Sharma',
      role: 'Principal Research Advisor',
      company: 'Renewable Energy Lab, VNIT',
      email: 'advisor@vnit.ac.in',
      phone: '+91 98220 12345',
      area: 'PAWAN SHAKTI',
      note: 'Monthly review on aerodynamic rotor efficiency and grant recommendations.',
      created_at: now,
      updated_at: now,
    },
    {
      id: generateId(),
      name: 'Vikram Joshi',
      role: 'Managing Director',
      company: 'Precision Wind Parts Ltd',
      email: 'vikram@precisionwind.in',
      phone: '+91 98234 56789',
      area: 'PAWAN SHAKTI',
      note: 'Supplier for rotor shaft forgings and dual-row bearings.',
      created_at: now,
      updated_at: now,
    },
  ];
  await db.contacts.bulkAdd(sampleContacts);

  // NeoSapien Personal Memories Seed
  const sampleNeoMemories: NeoMemory[] = [
    {
      id: generateId(),
      originalNeoId: 'neo-mem-20261102-pawan',
      title: 'Pawan Shakti 5kW Wind Turbine Aerodynamics & Rotor Hub Review',
      source: 'wearable_neo1',
      platform: 'in_person',
      capturedAt: '2026-11-02T14:30:00.000Z',
      durationMinutes: 45,
      summary: 'Technical discussion with Dr. K.S. Sharma regarding blade tip-speed ratio optimization for the 5kW vertical axis turbine. Agreed to select NACA 0018 airfoil for improved low-wind self-starting capability. Need to complete FEA on the central rotor hub before casting.',
      transcript: 'Yashwanth: "Doctor Sharma, looking at the wind speed distribution data in Maharashtra, our cut-in speed needs to drop below 2.5 m/s."\nDr. Sharma: "Exactly Yashwanth. If you switch to the NACA 0018 profile with a 12-degree pitch, low-wind self-starting torque improves by 28%. But make sure your central hub finite element analysis is completed before freezing the casting patterns."',
      speakers: [
        { speakerId: 's1', name: 'Yashwanth Koyaneni', isUser: true },
        { speakerId: 's2', name: 'Dr. K. S. Sharma', isUser: false },
      ],
      decisions: [
        { id: 'd1', text: 'Approved NACA 0018 airfoil for Pawan Shakti turbine blades' },
        { id: 'd2', text: 'Maintain cut-in wind speed threshold at 2.5 m/s' },
      ],
      actionItems: [
        {
          id: generateId(),
          text: 'Run Ansys FEA on central rotor hub under 45 m/s storm gust conditions',
          assigneeName: 'Yashwanth Koyaneni',
          detectedDeadline: '2026-11-10',
          status: 'pending_approval',
          isCommitment: true,
          priority: 'high',
          reconciliationStatus: 'new_commitment',
        },
        {
          id: generateId(),
          text: 'Send revised CAD drawings of blade bracket to Vikram Joshi',
          assigneeName: 'Yashwanth Koyaneni',
          detectedDeadline: '2026-11-08',
          status: 'pending_approval',
          isCommitment: true,
          priority: 'medium',
          reconciliationStatus: 'new_commitment',
        },
      ],
      commitments: [
        'Send revised CAD drawings of blade bracket to Vikram Joshi by Friday',
        'Complete FEA report for wind turbine grant submission',
      ],
      followUps: ['Schedule follow-up review with VNIT Renewable Energy Lab next Tuesday'],
      reminders: ['Check supplier quotation for dual-row spherical roller bearings'],
      peopleMentioned: ['Dr. K. S. Sharma', 'Vikram Joshi'],
      associatedArea: 'PAWAN SHAKTI',
      tags: ['Pawan Shakti', 'Wind Turbine', 'Aerodynamics', 'TRL-5', 'Hardware'],
      importedAt: '2026-11-02T15:20:00.000Z',
      syncMethod: 'mcp',
    },
    {
      id: generateId(),
      originalNeoId: 'neo-mem-20261103-mgauto',
      title: 'MG Automation Industrial Robot Cell PLC & Safety Architecture',
      source: 'desktop_meeting',
      platform: 'google_meet',
      capturedAt: '2026-11-03T11:00:00.000Z',
      durationMinutes: 35,
      summary: 'Desktop Google Meet call with client engineering team. Finalized Siemens S7-1200 safety interlocks and Profinet communication layout for automated sorting line.',
      transcript: 'Yashwanth: "Let us review the E-stop safety circuit for cell 2."\nRohan: "We need dual-channel input to meet Category 4 PL-e compliance."\nYashwanth: "Agreed. I will finalize the electrical wiring schematic by Thursday evening."',
      speakers: [
        { speakerId: 's1', name: 'Yashwanth Koyaneni', isUser: true },
        { speakerId: 's3', name: 'Rohan Deshmukh (Lead Controls)', isUser: false },
      ],
      decisions: [
        { id: 'd3', text: 'Standardized on Siemens S7-1200 F-CPU for category 4 safety circuit' },
      ],
      actionItems: [
        {
          id: generateId(),
          text: 'Generate electrical wiring schematic for emergency stop relays',
          assigneeName: 'Yashwanth Koyaneni',
          detectedDeadline: '2026-11-12',
          status: 'pending_approval',
          isCommitment: true,
          priority: 'high',
          reconciliationStatus: 'new_commitment',
        },
      ],
      commitments: ['Deliver finalized electrical schematics by Thursday evening'],
      followUps: ['Verify sensor lead time with Sick India distributor'],
      reminders: ['Review client factory layout constraints before next call'],
      peopleMentioned: ['Rohan Deshmukh'],
      associatedArea: 'MG Automation',
      tags: ['MG Automation', 'Robotics', 'PLC', 'Google Meet', 'Industrial Automation'],
      importedAt: '2026-11-03T11:45:00.000Z',
      syncMethod: 'webhook',
    },
  ];
  await db.neo_memories.bulkAdd(sampleNeoMemories);
}
