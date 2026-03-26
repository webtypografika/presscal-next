import { prisma } from '@/lib/db';
import { NextRequest } from 'next/server';
import { calcImposition } from '@/lib/calc/imposition';
import { calculateCost } from '@/lib/calc/cost';
import type { CalculatorInput } from '@/types/calculator';
import type { DigitalSpecs, OffsetSpecs } from '@/types/machine';
import type { ImpositionInput, PrintableArea } from '@/lib/calc/imposition';
import type { CostInput } from '@/lib/calc/cost';

const ORG_ID = 'default-org';

export async function POST(req: NextRequest) {
  try {
    const body: CalculatorInput = await req.json();

    // ─── FETCH MACHINE ───
    const machine = await prisma.machine.findFirst({
      where: { id: body.machineId, orgId: ORG_ID, deletedAt: null },
      include: { consumables: { where: { deletedAt: null } } },
    });
    if (!machine) {
      return Response.json({ error: 'Μηχανή δεν βρέθηκε' }, { status: 404 });
    }

    // ─── FETCH PAPER ───
    const paper = await prisma.material.findFirst({
      where: { id: body.paperId, orgId: ORG_ID, deletedAt: null },
    });
    if (!paper) {
      return Response.json({ error: 'Χαρτί δεν βρέθηκε' }, { status: 404 });
    }

    // ─── FETCH PROFILE ───
    const profile = await prisma.profile.findFirst({
      where: { orgId: ORG_ID, isDefault: true, deletedAt: null },
    }) || {
      paperMarkup: 50,
      printMarkup: 100,
      guillotineMarkup: 100,
      lamMarkup: 100,
      bindingMarkup: 100,
      minChargePrint: null,
      minChargeGuillotine: null,
      minChargeLam: null,
      minChargeBinding: null,
    };

    // ─── FETCH FINISHING MACHINES ───
    let guillotineData: CostInput['guillotine'] | undefined;
    if (body.guillotineId) {
      const guill = await prisma.postpressMachine.findFirst({
        where: { id: body.guillotineId, orgId: ORG_ID, deletedAt: null },
      });
      if (guill) {
        const gSpecs = (guill.specs as Record<string, number>) || {};
        guillotineData = {
          costPerCut: gSpecs.costPerCut,
          costPerMinute: guill.hourlyRate ? guill.hourlyRate / 60 : undefined,
          speed: guill.speed || undefined,
        };
      }
    }

    let lamData: CostInput['lamination'] | undefined;
    if (body.lamMachineId && body.lamFilmId) {
      const lamMachine = await prisma.postpressMachine.findFirst({
        where: { id: body.lamMachineId, orgId: ORG_ID, deletedAt: null },
      });
      const lamFilm = await prisma.material.findFirst({
        where: { id: body.lamFilmId, orgId: ORG_ID, deletedAt: null },
      });
      if (lamMachine && lamFilm) {
        const lSpecs = (lamMachine.specs as Record<string, number>) || {};
        lamData = {
          filmCostPerSqm: lamFilm.costPerUnit || 0,
          machineSetupCost: lamMachine.setupCost || 0,
          machineRunCostPerSheet: lSpecs.runCostPerSheet || 0,
          sides: body.lamSides || 1,
        };
      }
    }

    let bindData: CostInput['binding'] | undefined;
    if (body.bindingType && body.bindingMachineId) {
      const bindMachine = await prisma.postpressMachine.findFirst({
        where: { id: body.bindingMachineId, orgId: ORG_ID, deletedAt: null },
      });
      if (bindMachine) {
        const bSpecs = (bindMachine.specs as Record<string, number>) || {};
        bindData = {
          type: body.bindingType as 'staple' | 'glue' | 'spiral',
          costPerUnit: bSpecs.costPerUnit || 0,
          setupCost: bindMachine.setupCost || 0,
        };
      }
    }

    // ─── BUILD SPECS ───
    const machineSpecs = (machine.specs as unknown || {}) as DigitalSpecs | OffsetSpecs;
    const machineCat = machine.cat as 'digital' | 'offset';

    // ─── IMPOSITION ───
    const area: PrintableArea = {
      paperW: machine.maxLS || 330,
      paperH: machine.maxSS || 487,
      marginTop: machine.marginTop || 0,
      marginBottom: machine.marginBottom || 0,
      marginLeft: machine.marginLeft || 0,
      marginRight: machine.marginRight || 0,
    };

    const impoInput: ImpositionInput = {
      mode: body.impositionMode,
      trimW: body.jobW,
      trimH: body.jobH,
      bleed: body.bleed,
      qty: body.qty,
      sides: body.sides,
      gutter: body.impoGutter || 0,
      area,
      forceUps: body.impoForceUps,
      rotation: body.impoRotation,
    };

    const imposition = calcImposition(impoInput);

    // ─── COST ───
    const costInput: CostInput = {
      machineCat,
      machineMaxW: area.paperW,
      machineMaxH: area.paperH,
      specs: machineSpecs,
      includeDepreciation: Boolean((machineSpecs as unknown as Record<string, unknown>).includeDepreciation),
      machineCost: ((machineSpecs as unknown as Record<string, unknown>).machineCost as number) || undefined,
      machineLifetimePasses: ((machineSpecs as unknown as Record<string, unknown>).machineLifetimePasses as number) || undefined,

      paperW: paper.width || 860,
      paperH: paper.height || 610,
      paperCostPerUnit: paper.costPerUnit || 0,
      paperGsm: paper.thickness || 80,

      qty: body.qty,
      sides: body.sides,
      colorMode: body.colorMode,
      coverageLevel: body.coverageLevel,
      coveragePdf: body.coveragePdf,

      imposition,

      guillotine: guillotineData,
      lamination: lamData,
      binding: bindData,

      paperMarkup: profile.paperMarkup,
      printMarkup: profile.printMarkup,
      guillotineMarkup: profile.guillotineMarkup,
      lamMarkup: profile.lamMarkup,
      bindingMarkup: profile.bindingMarkup,
      minChargePrint: profile.minChargePrint || undefined,
      minChargeGuillotine: profile.minChargeGuillotine || undefined,
      minChargeLam: profile.minChargeLam || undefined,
      minChargeBinding: profile.minChargeBinding || undefined,

      offsetFrontCmyk: body.offsetFrontCmyk,
      offsetBackCmyk: body.offsetBackCmyk,
      offsetFrontPms: body.offsetFrontPms,
      offsetBackPms: body.offsetBackPms,
      offsetOilVarnish: body.offsetOilVarnish,
    };

    const result = calculateCost(costInput);

    return Response.json({ imposition, result });
  } catch (err) {
    console.error('Calculator API error:', err);
    return Response.json(
      { error: 'Σφάλμα υπολογισμού' },
      { status: 500 },
    );
  }
}

// ─── MACHINES LIST ───
export async function GET() {
  const [machines, materials, postpress, profiles, products] = await Promise.all([
    prisma.machine.findMany({
      where: { orgId: ORG_ID, deletedAt: null },
      select: {
        id: true, name: true, cat: true,
        maxLS: true, maxSS: true,
        marginTop: true, marginBottom: true, marginLeft: true, marginRight: true,
        specs: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.material.findMany({
      where: { orgId: ORG_ID, deletedAt: null, cat: 'sheet' },
      select: {
        id: true, name: true, groupName: true, supplier: true,
        width: true, height: true, thickness: true,
        costPerUnit: true, unit: true,
      },
      orderBy: [{ groupName: 'asc' }, { name: 'asc' }],
    }),
    prisma.postpressMachine.findMany({
      where: { orgId: ORG_ID, deletedAt: null },
      select: {
        id: true, name: true, subtype: true,
        setupCost: true, speed: true, hourlyRate: true, specs: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.profile.findMany({
      where: { orgId: ORG_ID, deletedAt: null },
      select: {
        id: true, name: true, isDefault: true,
        paperMarkup: true, printMarkup: true, guillotineMarkup: true,
        lamMarkup: true, bindingMarkup: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.product.findMany({
      where: { orgId: ORG_ID, deletedAt: null },
      select: {
        id: true, name: true, archetype: true,
        pages: true, sheetsPerPad: true, bodyPages: true, customMult: true,
        offset: true, digital: true,
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  return Response.json({ machines, materials, postpress, profiles, products });
}
