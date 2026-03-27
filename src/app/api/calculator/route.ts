import { prisma } from '@/lib/db';
import { NextRequest } from 'next/server';
import { calcImposition } from '@/lib/calc/imposition';
import { calculateCost } from '@/lib/calc/cost';
import type { CalculatorInput } from '@/types/calculator';
import type { DigitalSpecs, OffsetSpecs } from '@/types/machine';
import type { ImpositionInput, PrintableArea } from '@/lib/calc/imposition';
import type { CostInput } from '@/lib/calc/cost';

const ORG_ID = 'default-org';

// ─── MAP DB SPECS → TypeScript interfaces ───
// DB stores flat keys (toner_c_cost, off_towers) from wizard
// Cost engine expects nested TypeScript interface (tonerC: {cost, yield})

function mapDigitalSpecs(raw: Record<string, unknown>): DigitalSpecs {
  return {
    costMode: ((raw.cost_mode as string) || 'simple_in') as DigitalSpecs['costMode'],
    colorStations: (raw.color_stations as number) || 4,
    consumableType: (raw.consumable_type as string) === 'ink' ? 'ink' : 'toner',
    duplexClickMultiplier: (raw.duplex_click_multiplier as number) || 2,

    clickA4Color: (raw.click_a4_color as number) || undefined,
    clickA4Bw: (raw.click_a4_bw as number) || undefined,
    clickA3Color: (raw.click_a3_color as number) || undefined,
    clickA3Bw: (raw.click_a3_bw as number) || undefined,
    clickBannerColor: (raw.click_banner_color as number) || undefined,
    clickBannerBw: (raw.click_banner_bw as number) || undefined,

    tonerC: raw.toner_c_cost ? { cost: raw.toner_c_cost as number, yield: (raw.toner_c_yield as number) || 1 } : undefined,
    tonerM: raw.toner_m_cost ? { cost: raw.toner_m_cost as number, yield: (raw.toner_m_yield as number) || 1 } : undefined,
    tonerY: raw.toner_y_cost ? { cost: raw.toner_y_cost as number, yield: (raw.toner_y_yield as number) || 1 } : undefined,
    tonerK: raw.toner_k_cost ? { cost: raw.toner_k_cost as number, yield: (raw.toner_k_yield as number) || 1 } : undefined,

    drumC: raw.drum_c_cost ? { cost: raw.drum_c_cost as number, yield: (raw.drum_c_life as number) || 1 } : undefined,
    drumM: raw.drum_m_cost ? { cost: raw.drum_m_cost as number, yield: (raw.drum_m_life as number) || 1 } : undefined,
    drumY: raw.drum_y_cost ? { cost: raw.drum_y_cost as number, yield: (raw.drum_y_life as number) || 1 } : undefined,
    drumK: raw.drum_k_cost ? { cost: raw.drum_k_cost as number, yield: (raw.drum_k_life as number) || 1 } : undefined,

    developerType: (raw.developer_type as string) === 'integrated' ? 'integrated' : 'separate',
    developerC: raw.dev_c_cost ? { cost: raw.dev_c_cost as number, yield: (raw.dev_c_life as number) || 1 } : undefined,
    developerM: raw.dev_m_cost ? { cost: raw.dev_m_cost as number, yield: (raw.dev_m_life as number) || 1 } : undefined,
    developerY: raw.dev_y_cost ? { cost: raw.dev_y_cost as number, yield: (raw.dev_y_life as number) || 1 } : undefined,
    developerK: raw.dev_k_cost ? { cost: raw.dev_k_cost as number, yield: (raw.dev_k_life as number) || 1 } : undefined,

    hasChargeCoronas: !!raw.has_charge_coronas,
    coronaCost: (raw.corona_cost as number) || undefined,
    coronaLife: (raw.corona_life as number) || undefined,

    fuserCost: (raw.fuser_cost as number) || undefined,
    fuserLife: (raw.fuser_life as number) || undefined,
    beltCost: (raw.belt_cost as number) || undefined,
    beltLife: (raw.belt_life as number) || undefined,
    wasteCost: (raw.waste_cost as number) || undefined,
    wasteLife: (raw.waste_life as number) || undefined,

    speedPpmColor: (raw.speed_ppm_color as number) || undefined,
    speedPpmBw: (raw.speed_ppm_bw as number) || undefined,
    speedZones: raw.speed_zones as DigitalSpecs['speedZones'],
  };
}

function mapOffsetSpecs(raw: Record<string, unknown>): OffsetSpecs {
  return {
    towers: (raw.off_towers as number) || 4,
    speed: (raw.off_speed as number) || (raw.off_common_speed as number) || 5000,
    perfecting: !!raw.off_perfecting,
    hasVarnishTower: !!raw.off_has_varnish_tower,
    varnishType: (raw.off_varnish_type as OffsetSpecs['varnishType']) || undefined,
    defaultWaste: (raw.off_default_waste as number) || 50,
    wastePercent: (raw.registration_spoilage_pct as number) || 2,
    plateCost: (raw.off_plate_c as number) || 0,
    includePlates: raw.off_include_parts !== false,
    blanketCost: (raw.off_blanket_c as number) || 0,
    blanketLife: (raw.off_blanket_life as number) || 50000,
    inkGm2: (raw.off_ink_gm2 as number) || 1.5,
    inkPricePerKg: (raw.off_ink_weight as number) ? undefined : undefined, // comes from consumables
    rollerCount: (raw.off_roller_count as number) || undefined,
    rollerCost: (raw.off_roller_recover_c as number) || undefined,
    rollerLife: (raw.off_roller_recover_life as number) || undefined,
    washPassesPerRun: raw.off_wash_min ? 1 : 0,
    inkCleanerCpl: (raw.chem_wash_ink_c as number) || undefined,
    waterCleanerCpl: (raw.chem_wash_water_c as number) || undefined,
    washMlPerLiter: (raw.off_chem_wash_ml as number) || undefined,
    ipaMlPerHour: (raw.off_chem_fountain_ml_h as number) || undefined,
    ipaCpl: (raw.chem_alcohol_c as number) || undefined,
    varnishGm2: (raw.off_varnish_gm2 as number) || undefined,
    coatingGm2: (raw.off_coating_gm2 as number) || undefined,
    coatingPricePerKg: (raw.off_coating_c as number) || undefined,
    hourCost: (raw.off_hour_c as number) || 0,
    setupMin: (raw.off_setup_min as number) || 15,
  };
}

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

    // ─── FETCH PRODUCT (optional) ───
    let productPricing: Record<string, unknown> | null = null;
    if (body.productId) {
      const product = await prisma.product.findFirst({
        where: { id: body.productId, orgId: ORG_ID, deletedAt: null },
      });
      if (product) {
        const macCat = machine.cat;
        if (macCat === 'offset' || macCat === 'digital') {
          const pData = (macCat === 'offset' ? product.offset : product.digital) as Record<string, unknown> || {};
          productPricing = { ...pData, archetype: product.archetype, name: product.name };
        }
      }
    }

    // ─── BUILD SPECS ───
    const rawSpecs = (machine.specs as Record<string, unknown>) || {};
    const machineCat = machine.cat as 'digital' | 'offset';
    const machineSpecs: DigitalSpecs | OffsetSpecs = machineCat === 'offset'
      ? mapOffsetSpecs(rawSpecs)
      : mapDigitalSpecs(rawSpecs);

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
      includeDepreciation: !!rawSpecs.include_depreciation,
      machineCost: (rawSpecs.machine_cost as number) || undefined,
      machineLifetimePasses: (rawSpecs.machine_lifetime_passes as number) || undefined,

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
      productPricing: productPricing ? {
        charge_per_color: productPricing.charge_per_color as number,
        min_charge: productPricing.min_charge as number,
        extra_pantone: productPricing.extra_pantone as number,
        extra_varnish: productPricing.extra_varnish as number,
        hourly_enabled: productPricing.hourly_enabled as boolean,
        hourly_rate: productPricing.hourly_rate as number,
        price_color: productPricing.price_color as number,
        price_bw: productPricing.price_bw as number,
        discount_step_qty: productPricing.discount_step_qty as number,
        discount_step_pct: productPricing.discount_step_pct as number,
        discount_max: productPricing.discount_max as number,
      } : undefined,
    };

    const result = calculateCost(costInput);

    return Response.json({ imposition, result, debug: { machineCat, productPricing: productPricing?.name } });
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
