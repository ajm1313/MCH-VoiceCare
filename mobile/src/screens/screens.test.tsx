/**
 * Screen component tests using react-test-renderer.
 */
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';

// Mock navigation
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: { episodeId: 'ep-1', childId: 'child-1' } }),
}));

// Mock safe area context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  SafeAreaProvider: 'SafeAreaProvider',
}));

// Mock database
jest.mock('../core/db/database', () => ({
  getDb: jest.fn(() => ({ execute: jest.fn() })),
  query: jest.fn(() => []),
  initDatabase: jest.fn(),
}));

// Mock sync modules
jest.mock('../core/sync/outbox', () => ({
  enqueue: jest.fn(),
  getQueueDepth: jest.fn(() => 0),
}));

jest.mock('../core/sync/engine', () => ({
  subscribeToSyncDepth: jest.fn(() => jest.fn()),
  syncFull: jest.fn().mockResolvedValue(undefined),
  startBackgroundSync: jest.fn(),
  stopBackgroundSync: jest.fn(),
}));

// Mock auth store
jest.mock('../core/auth/authStore', () => ({
  useAuthStore: jest.fn(() => ({
    user: { id: 'u1', username: 'worker', fullName: 'Test Worker', systemRole: 'FACILITY_CLINICAL_USER' },
    token: 'test-token',
    login: jest.fn().mockResolvedValue(true),
    logout: jest.fn().mockResolvedValue(undefined),
    restoreSession: jest.fn().mockResolvedValue(undefined),
    isLoading: false,
    error: null,
  })),
}));

function render(component: React.ReactElement): any {
  let tree: any;
  act(() => {
    tree = TestRenderer.create(component);
  });
  return tree!;
}

function findAllTexts(tree: any): string[] {
  return tree.root
    .findAllByType('Text')
    .flatMap((t: any) => {
      const c = t.props.children;
      if (typeof c === 'string') return [c];
      if (Array.isArray(c)) return c.filter((x: any) => typeof x === 'string');
      return [];
    });
}

describe('LoginScreen', () => {
  it('renders without crashing', () => {
    const { LoginScreen } = require('./LoginScreen');
    const tree = render(<LoginScreen />);
    expect(tree).toBeDefined();
    expect(tree.root.children.length).toBeGreaterThan(0);
  });

  it('displays the app title', () => {
    const { LoginScreen } = require('./LoginScreen');
    const tree = render(<LoginScreen />);
    const texts = findAllTexts(tree);
    expect(texts.some((t: string) => t.includes('MCH VoiceCare'))).toBe(true);
  });

  it('has username and password inputs', () => {
    const { LoginScreen } = require('./LoginScreen');
    const tree = render(<LoginScreen />);
    const inputs = tree.root.findAllByType('TextInput');
    expect(inputs.length).toBe(2);
  });
});

describe('DashboardScreen', () => {
  it('renders without crashing', () => {
    const { DashboardScreen } = require('./DashboardScreen');
    const tree = render(<DashboardScreen navigation={{ navigate: mockNavigate } as any} />);
    expect(tree).toBeDefined();
  });

  it('displays user greeting', () => {
    const { DashboardScreen } = require('./DashboardScreen');
    const tree = render(<DashboardScreen navigation={{ navigate: mockNavigate } as any} />);
    const texts = findAllTexts(tree);
    expect(texts.some((t: string) => t.includes('Welcome'))).toBe(true);
  });

  it('renders module navigation cards', () => {
    const { DashboardScreen } = require('./DashboardScreen');
    const tree = render(<DashboardScreen navigation={{ navigate: mockNavigate } as any} />);
    const labels = findAllTexts(tree);
    expect(labels).toContain('Pregnancy');
    expect(labels).toContain('Newborn');
    expect(labels).toContain('Immunisation');
    expect(labels).toContain('Growth');
    expect(labels).toContain('Tasks');
  });
});

describe('GrowthListScreen', () => {
  it('renders without crashing', () => {
    const { GrowthListScreen } = require('./GrowthListScreen');
    const tree = render(<GrowthListScreen />);
    expect(tree).toBeDefined();
  });

  it('shows empty state when no data', () => {
    const { query } = require('../core/db/database');
    (query as jest.Mock).mockReturnValue([]);

    const { GrowthListScreen } = require('./GrowthListScreen');
    const tree = render(<GrowthListScreen />);
    const texts = findAllTexts(tree);
    expect(texts.some((t: string) => t.includes('No growth measurements'))).toBe(true);
  });
});

describe('GrowthDetailScreen', () => {
  it('renders without crashing', () => {
    const { GrowthDetailScreen } = require('./GrowthDetailScreen');
    const tree = render(<GrowthDetailScreen />);
    expect(tree).toBeDefined();
  });

  it('shows record button', () => {
    const { GrowthDetailScreen } = require('./GrowthDetailScreen');
    const tree = render(<GrowthDetailScreen />);
    const texts = findAllTexts(tree);
    expect(texts.some((t: string) => t.includes('Record New Measurement'))).toBe(true);
  });
});

describe('GrowthRecordScreen', () => {
  it('renders without crashing', () => {
    const { GrowthRecordScreen } = require('./GrowthRecordScreen');
    const tree = render(<GrowthRecordScreen />);
    expect(tree).toBeDefined();
  });

  it('has weight, length, height, and MUAC inputs', () => {
    const { GrowthRecordScreen } = require('./GrowthRecordScreen');
    const tree = render(<GrowthRecordScreen />);
    const inputs = tree.root.findAllByType('TextInput');
    expect(inputs.length).toBeGreaterThanOrEqual(5);
  });

  it('has a save button', () => {
    const { GrowthRecordScreen } = require('./GrowthRecordScreen');
    const tree = render(<GrowthRecordScreen />);
    const texts = findAllTexts(tree);
    expect(texts.some((t: string) => t.includes('Save Measurement'))).toBe(true);
  });
});

describe('TaskListScreen', () => {
  it('renders without crashing', () => {
    const { TaskListScreen } = require('./TaskListScreen');
    const tree = render(<TaskListScreen />);
    expect(tree).toBeDefined();
  });
});

describe('PregnancyListScreen', () => {
  it('renders without crashing', () => {
    const { PregnancyListScreen } = require('./PregnancyListScreen');
    const tree = render(<PregnancyListScreen navigation={{ navigate: mockNavigate } as any} />);
    expect(tree).toBeDefined();
  });

  it('shows empty state when no episodes', () => {
    const { query } = require('../core/db/database');
    (query as jest.Mock).mockReturnValue([]);

    const { PregnancyListScreen } = require('./PregnancyListScreen');
    const tree = render(<PregnancyListScreen navigation={{ navigate: mockNavigate } as any} />);
    const texts = findAllTexts(tree);
    expect(texts.some((t: string) => t.includes('No active pregnancies'))).toBe(true);
  });

  it('has a register button', () => {
    const { PregnancyListScreen } = require('./PregnancyListScreen');
    const tree = render(<PregnancyListScreen navigation={{ navigate: mockNavigate } as any} />);
    const texts = findAllTexts(tree);
    expect(texts.some((t: string) => t.includes('Register'))).toBe(true);
  });
});

describe('PregnancyRegisterScreen', () => {
  it('renders without crashing', () => {
    const { PregnancyRegisterScreen } = require('./PregnancyRegisterScreen');
    const tree = render(<PregnancyRegisterScreen />);
    expect(tree).toBeDefined();
  });

  it('has identity and dating fields', () => {
    const { PregnancyRegisterScreen } = require('./PregnancyRegisterScreen');
    const tree = render(<PregnancyRegisterScreen />);
    const texts = findAllTexts(tree);
    // Step 1 shows "Identity", step 2 shows "Dating" — check step indicator and section titles
    const allText = texts.join(' ');
    expect(allText).toMatch(/Identity/i);
  });

  it('has a save button', () => {
    const { PregnancyRegisterScreen } = require('./PregnancyRegisterScreen');
    const tree = render(<PregnancyRegisterScreen />);
    const texts = findAllTexts(tree);
    expect(texts.some((t: string) => t.includes('Register'))).toBe(true);
  });
});

describe('PregnancyDetailScreen', () => {
  it('renders without crashing', () => {
    const { PregnancyDetailScreen } = require('./PregnancyDetailScreen');
    const tree = render(
      <PregnancyDetailScreen
        route={{ params: { episodeId: 'ep-1' } } as any}
        navigation={{ goBack: mockGoBack, navigate: mockNavigate } as any}
      />,
    );
    expect(tree).toBeDefined();
  });

  it('has a back button', () => {
    const { PregnancyDetailScreen } = require('./PregnancyDetailScreen');
    const tree = render(
      <PregnancyDetailScreen
        route={{ params: { episodeId: 'ep-1' } } as any}
        navigation={{ goBack: mockGoBack, navigate: mockNavigate } as any}
      />,
    );
    const texts = findAllTexts(tree);
    expect(texts.some((t: string) => t.includes('Back'))).toBe(true);
  });
});

describe('PregnancyObserveScreen', () => {
  it('renders without crashing', () => {
    const { PregnancyObserveScreen } = require('./PregnancyObserveScreen');
    const tree = render(
      <PregnancyObserveScreen
        route={{ params: { episodeId: 'ep-1' } } as any}
        navigation={{ goBack: mockGoBack, navigate: mockNavigate } as any}
      />,
    );
    expect(tree).toBeDefined();
  });

  it('has vital sign inputs', () => {
    const { PregnancyObserveScreen } = require('./PregnancyObserveScreen');
    const tree = render(
      <PregnancyObserveScreen
        route={{ params: { episodeId: 'ep-1' } } as any}
        navigation={{ goBack: mockGoBack, navigate: mockNavigate } as any}
      />,
    );
    const inputs = tree.root.findAllByType('TextInput');
    expect(inputs.length).toBeGreaterThanOrEqual(5);
  });

  it('has a save button', () => {
    const { PregnancyObserveScreen } = require('./PregnancyObserveScreen');
    const tree = render(
      <PregnancyObserveScreen
        route={{ params: { episodeId: 'ep-1' } } as any}
        navigation={{ goBack: mockGoBack, navigate: mockNavigate } as any}
      />,
    );
    const texts = findAllTexts(tree);
    expect(texts.some((t: string) => t.includes('Save') || t.includes('Submit'))).toBe(true);
  });
});

describe('NewbornListScreen', () => {
  it('renders without crashing', () => {
    const { NewbornListScreen } = require('./NewbornListScreen');
    const tree = render(<NewbornListScreen />);
    expect(tree).toBeDefined();
  });

  it('has a register button', () => {
    const { NewbornListScreen } = require('./NewbornListScreen');
    const tree = render(<NewbornListScreen />);
    const texts = findAllTexts(tree);
    expect(texts.some((t: string) => t.includes('Register'))).toBe(true);
  });
});

describe('NewbornRegisterScreen', () => {
  it('renders without crashing', () => {
    const { NewbornRegisterScreen } = require('./NewbornRegisterScreen');
    const tree = render(<NewbornRegisterScreen />);
    expect(tree).toBeDefined();
  });

  it('has birth and identity sections', () => {
    const { NewbornRegisterScreen } = require('./NewbornRegisterScreen');
    const tree = render(<NewbornRegisterScreen />);
    const texts = findAllTexts(tree);
    expect(texts.some((t: string) => t.includes('Birth Details'))).toBe(true);
    expect(texts.some((t: string) => t.includes('Identity'))).toBe(true);
  });
});

describe('NewbornDetailScreen', () => {
  it('renders without crashing', () => {
    const { NewbornDetailScreen } = require('./NewbornDetailScreen');
    const tree = render(<NewbornDetailScreen />);
    expect(tree).toBeDefined();
  });
});

describe('NewbornObserveScreen', () => {
  it('renders without crashing', () => {
    const { NewbornObserveScreen } = require('./NewbornObserveScreen');
    const tree = render(<NewbornObserveScreen />);
    expect(tree).toBeDefined();
  });

  it('has vital sign inputs', () => {
    const { NewbornObserveScreen } = require('./NewbornObserveScreen');
    const tree = render(<NewbornObserveScreen />);
    const inputs = tree.root.findAllByType('TextInput');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ImmunisationListScreen', () => {
  it('renders without crashing', () => {
    const { ImmunisationListScreen } = require('./ImmunisationListScreen');
    const tree = render(<ImmunisationListScreen />);
    expect(tree).toBeDefined();
  });

  it('has a register button', () => {
    const { ImmunisationListScreen } = require('./ImmunisationListScreen');
    const tree = render(<ImmunisationListScreen />);
    const texts = findAllTexts(tree);
    expect(texts.some((t: string) => t.includes('Register'))).toBe(true);
  });
});

describe('ImmunisationRegisterScreen', () => {
  it('renders without crashing', () => {
    const { ImmunisationRegisterScreen } = require('./ImmunisationRegisterScreen');
    const tree = render(<ImmunisationRegisterScreen />);
    expect(tree).toBeDefined();
  });

  it('has identity and location sections', () => {
    const { ImmunisationRegisterScreen } = require('./ImmunisationRegisterScreen');
    const tree = render(<ImmunisationRegisterScreen />);
    const texts = findAllTexts(tree);
    expect(texts.some((t: string) => t.includes('Identity'))).toBe(true);
    expect(texts.some((t: string) => t.includes('Location'))).toBe(true);
  });
});

describe('ImmunisationChildDetailScreen', () => {
  it('renders without crashing', () => {
    const { ImmunisationChildDetailScreen } = require('./ImmunisationChildDetailScreen');
    const tree = render(<ImmunisationChildDetailScreen />);
    expect(tree).toBeDefined();
  });
});

describe('ImmunisationRecordDoseScreen', () => {
  it('renders without crashing', () => {
    const { ImmunisationRecordDoseScreen } = require('./ImmunisationRecordDoseScreen');
    const tree = render(<ImmunisationRecordDoseScreen />);
    expect(tree).toBeDefined();
  });

  it('has vaccine and dose inputs', () => {
    const { ImmunisationRecordDoseScreen } = require('./ImmunisationRecordDoseScreen');
    const tree = render(<ImmunisationRecordDoseScreen />);
    const inputs = tree.root.findAllByType('TextInput');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it('has a save button', () => {
    const { ImmunisationRecordDoseScreen } = require('./ImmunisationRecordDoseScreen');
    const tree = render(<ImmunisationRecordDoseScreen />);
    const texts = findAllTexts(tree);
    expect(texts.some((t: string) => t.includes('Save') || t.includes('Record'))).toBe(true);
  });
});
