/**
 * UI kit tests.
 *
 * These guard the design system contract, in particular UX-002: an urgency
 * must never be communicated by colour alone, and a GREY / data-missing class
 * must never read as a routine or safe result (spec §3.1).
 */
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  SafeAreaProvider: 'SafeAreaProvider',
}));

import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  KeyValue,
  ListRow,
  Screen,
  SectionHeader,
  StatCard,
  UrgencyBadge,
  hasIcon,
} from './index';
import {urgencyMeta} from '../../theme/colors';

function render(node: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(node);
  });
  return tree;
}

/** Collect all rendered string content. */
function textOf(tree: TestRenderer.ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (node: any) => {
    if (node == null) return;
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node.children) node.children.forEach(walk);
  };
  walk(tree.toJSON());
  return out.join(' ');
}

/** Count rendered SVG Path elements — proves an icon was drawn. */
function pathCount(tree: TestRenderer.ReactTestRenderer): number {
  return tree.root.findAll(
    n => typeof n.type === 'string' && n.type.toLowerCase().includes('path'),
    {deep: true},
  ).length;
}

describe('Icon', () => {
  it('renders a known icon', () => {
    const tree = render(<Icon name="home" />);
    expect(pathCount(tree)).toBeGreaterThan(0);
  });

  it('renders a placeholder for an unknown icon instead of throwing', () => {
    expect(() => render(<Icon name="definitely-not-an-icon" />)).not.toThrow();
    expect(hasIcon('definitely-not-an-icon')).toBe(false);
  });

  it('reports known icon names', () => {
    expect(hasIcon('home')).toBe(true);
    // Every urgency class must have a real icon available (UX-002).
    Object.values(urgencyMeta).forEach(meta => {
      expect(hasIcon(meta.icon)).toBe(true);
    });
  });
});

describe('UrgencyBadge — UX-002', () => {
  const classes = ['RED', 'ORANGE', 'AMBER', 'GREEN', 'GREY'] as const;

  it.each(classes)('%s renders a text label AND an icon, never colour alone', cls => {
    const tree = render(<UrgencyBadge value={cls} />);
    // Text label present.
    expect(textOf(tree)).toContain(cls);
    // Icon present.
    expect(pathCount(tree)).toBeGreaterThan(0);
  });

  it.each(classes)('%s exposes meaning and action to assistive tech', cls => {
    const tree = render(<UrgencyBadge value={cls} />);
    const labelled = tree.root.findAll(
      n => !!n.props?.accessibilityLabel?.includes(urgencyMeta[cls].label),
      {deep: true},
    );
    expect(labelled.length).toBeGreaterThan(0);
    expect(labelled[0].props.accessibilityLabel).toContain(urgencyMeta[cls].action);
  });

  it('treats an unknown or missing urgency as GREY / data missing, not routine', () => {
    // spec §3.1 — an ABSTAIN or unknown value must not present as green/routine.
    for (const value of [undefined, null, '', 'WAT', 'unknown']) {
      const tree = render(<UrgencyBadge value={value as any} />);
      const text = textOf(tree);
      expect(text).toContain('GREY');
      expect(text).toContain('Data missing');
      expect(text).not.toContain('Routine');
    }
  });

  it('does not label GREY as safe or routine', () => {
    expect(urgencyMeta.GREY.label).toBe('Data missing');
    expect(urgencyMeta.GREY.label.toLowerCase()).not.toContain('routine');
    expect(urgencyMeta.GREY.action).toBe('Assessment needed');
  });

  it('supports class / meaning / both label modes', () => {
    expect(textOf(render(<UrgencyBadge value="RED" labelMode="class" />))).toContain('RED');
    expect(textOf(render(<UrgencyBadge value="RED" labelMode="meaning" />))).toContain('Emergency');
    const both = textOf(render(<UrgencyBadge value="RED" labelMode="both" />));
    expect(both).toContain('RED');
    expect(both).toContain('Emergency');
  });
});

describe('primitives render', () => {
  it('AppText renders its content', () => {
    expect(textOf(render(<AppText variant="h1">Hello</AppText>))).toContain('Hello');
  });

  it('Screen renders children', () => {
    expect(textOf(render(<Screen><AppText>Body</AppText></Screen>))).toContain('Body');
  });

  it('Screen renders children when scrollable', () => {
    expect(textOf(render(<Screen scroll><AppText>Scrolled</AppText></Screen>))).toContain('Scrolled');
  });

  it('Card renders children and is tappable when given onPress', () => {
    const onPress = jest.fn();
    const tree = render(<Card onPress={onPress}><AppText>Tap</AppText></Card>);
    expect(textOf(tree)).toContain('Tap');
    const pressable = tree.root.findAll(n => n.props?.accessibilityRole === 'button', {deep: true});
    expect(pressable.length).toBeGreaterThan(0);
  });

  it('Button renders its label and exposes a button role', () => {
    const tree = render(<Button label="Save" onPress={jest.fn()} />);
    expect(textOf(tree)).toContain('Save');
    expect(
      tree.root.findAll(n => n.props?.accessibilityRole === 'button', {deep: true}).length,
    ).toBeGreaterThan(0);
  });

  it('Button hides its label while loading and marks itself busy', () => {
    const tree = render(<Button label="Save" loading onPress={jest.fn()} />);
    expect(textOf(tree)).not.toContain('Save');
    const btn = tree.root.findAll(n => n.props?.accessibilityState?.busy === true, {deep: true});
    expect(btn.length).toBeGreaterThan(0);
  });

  it('Field renders its label and error message', () => {
    const tree = render(<Field label="Systolic BP" error="Out of range" />);
    const text = textOf(tree);
    expect(text).toContain('Systolic BP');
    expect(text).toContain('Out of range');
  });

  it('Field shows helper text when there is no error', () => {
    expect(textOf(render(<Field label="Weight" helper="in kilograms" />))).toContain('in kilograms');
  });

  it('Badge renders its label', () => {
    expect(textOf(render(<Badge label="Synced" tone="success" />))).toContain('Synced');
  });

  it('SectionHeader renders title, overline and action', () => {
    const text = textOf(
      render(
        <SectionHeader
          overline="Clinical"
          title="Pregnancies"
          subtitle="12 active"
          action={{label: 'View all', onPress: jest.fn()}}
        />,
      ),
    );
    expect(text).toContain('Clinical');
    expect(text).toContain('Pregnancies');
    expect(text).toContain('12 active');
    expect(text).toContain('View all');
  });

  it('EmptyState renders its message and action', () => {
    const text = textOf(
      render(<EmptyState title="Nothing here" message="No records yet" action={{label: 'Add', onPress: jest.fn()}} />),
    );
    expect(text).toContain('Nothing here');
    expect(text).toContain('No records yet');
    expect(text).toContain('Add');
  });

  it('ListRow renders title and subtitle', () => {
    const text = textOf(render(<ListRow title="Ama Mensah" subtitle="28y · G2P1" onPress={jest.fn()} />));
    expect(text).toContain('Ama Mensah');
    expect(text).toContain('28y · G2P1');
  });

  it('StatCard renders label and value', () => {
    const text = textOf(render(<StatCard label="Overdue" value={7} caption="this week" />));
    expect(text).toContain('Overdue');
    expect(text).toContain('7');
    expect(text).toContain('this week');
  });

  it('KeyValue shows a placeholder rather than inventing a missing value', () => {
    // spec §11 — a missing clinical value must be visibly absent.
    expect(textOf(render(<KeyValue label="Haemoglobin" value={null} />))).toContain('Not recorded');
    expect(textOf(render(<KeyValue label="Haemoglobin" value={11.2} />))).toContain('11.2');
  });
});
