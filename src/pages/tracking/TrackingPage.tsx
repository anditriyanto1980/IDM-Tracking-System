import React, { useState, useEffect, useMemo } from 'react';
import { Shipment, ShipmentMilestone, Customer, DistributionCenter } from '../../types';
import { getShipments } from '../../services/shipmentService';
import { getCustomers } from '../../services/customerService';
import { getDistributionCenters } from '../../services/dcService';
import {
  getAllMilestones,
  addMilestone,
  getLiveFleetSummary,
  searchWaybill,
} from '../../services/trackingService';
import { LiveRouteMapCard } from '../../components/tracking/LiveRouteMapCard';
import { TrackingDetailModal } from '../../components/tracking/TrackingDetailModal';
import { AddMilestoneModal } from '../../components/tracking/AddMilestoneModal';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import {
  Navigation,
  Truck,
  MapPin,
  Clock,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Boxes,
  Plus,
  ArrowRight,
} from 'lucide-react';

export const TrackingPage: React.FC = () => {
  const { user, canAccess } = useAuth();
  const { showToast } = useToast();

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [milestones, setMilestones] = useState<ShipmentMilestone[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dcs, setDcs] = useState<DistributionCenter[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [dcFilter, setDcFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Quick Waybill Direct Search
  const [waybillInput, setWaybillInput] = useState('');
  const [searchingWaybill, setSearchingWaybill] = useState(false);

  // Modals state
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [shipmentForMilestone, setShipmentForMilestone] = useState<Shipment | null>(null);
  const [isAddMilestoneOpen, setIsAddMilestoneOpen] = useState(false);

  const canEditTracking = canAccess('TRACKING', 'edit');

  const loadData = async () => {
    try {
      setLoading(true);
      const [shipData, mileData, custData, dcData] = await Promise.all([
        getShipments({}),
        getAllMilestones(),
        getCustomers(),
        getDistributionCenters(),
      ]);
      setShipments(shipData);
      setMilestones(mileData);
      setCustomers(custData);
      setDcs(dcData);
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Gagal Memuat Data Tracking',
        message: err?.message || 'Terjadi kesalahan sistem.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Quick Direct Search
  const handleQuickWaybillSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waybillInput.trim()) return;

    try {
      setSearchingWaybill(true);
      const result = await searchWaybill(waybillInput);
      if (result) {
        setSelectedShipment(result.shipment);
        setIsDetailModalOpen(true);
        showToast({
          type: 'success',
          title: 'Pengiriman Ditemukan',
          message: `Menampilkan live tracking untuk ${result.shipment.shipment_number}`,
        });
      } else {
        showToast({
          type: 'warning',
          title: 'Tidak Ditemukan',
          message: `Tidak ditemukan pengiriman dengan nomor resi/SJ/plat "${waybillInput}".`,
        });
      }
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Pencarian Gagal',
        message: err?.message || 'Terjadi gangguan koneksi.',
      });
    } finally {
      setSearchingWaybill(false);
    }
  };

  // Milestone lookup map: shipmentId -> latest milestone
  const latestMilestoneMap = useMemo(() => {
    const map = new Map<string, ShipmentMilestone>();
    milestones.forEach((m) => {
      const existing = map.get(m.shipment_id);
      if (
        !existing ||
        new Date(m.timestamp).getTime() > new Date(existing.timestamp).getTime()
      ) {
        map.set(m.shipment_id, m);
      }
    });
    return map;
  }, [milestones]);

  // Filtered shipments
  const filteredShipments = useMemo(() => {
    return shipments.filter((s) => {
      const matchCustomer =
        customerFilter === 'all' || s.customer_id === customerFilter;
      const matchDc = dcFilter === 'all' || s.dc_id === dcFilter;
      const matchStatus = statusFilter === 'all' || s.status === statusFilter;

      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        s.shipment_number.toLowerCase().includes(q) ||
        (s.tracking_number_ref && s.tracking_number_ref.toLowerCase().includes(q)) ||
        (s.vehicle_plate_number && s.vehicle_plate_number.toLowerCase().includes(q)) ||
        (s.driver_name && s.driver_name.toLowerCase().includes(q)) ||
        (s.dc?.dc_name && s.dc.dc_name.toLowerCase().includes(q)) ||
        (s.customer?.customer_name && s.customer.customer_name.toLowerCase().includes(q));

      return matchCustomer && matchDc && matchStatus && matchSearch;
    });
  }, [shipments, customerFilter, dcFilter, statusFilter, searchQuery]);

  const fleetSummary = useMemo(() => getLiveFleetSummary(shipments), [shipments]);

  // Handle adding milestone
  const handleSaveMilestone = async (data: {
    milestone_type: any;
    title: string;
    location: string;
    notes: string;
    timestamp: string;
  }) => {
    if (!shipmentForMilestone) return;
    try {
      const newM = await addMilestone(
        {
          shipment_id: shipmentForMilestone.id,
          ...data,
        },
        {
          userId: user?.id,
          userEmail: user?.email,
          userRole: user?.role,
        }
      );

      showToast({
        type: 'success',
        title: 'Checkpoint Berhasil Dicatat',
        message: `${newM.title} di ${newM.location} untuk ${shipmentForMilestone.shipment_number}`,
      });

      await loadData();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Gagal Mencatat Checkpoint',
        message: err?.message || 'Terjadi kesalahan sistem.',
      });
      throw err;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Title */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Navigation className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Live Shipment Tracking & Armada
              </h1>
              <p className="text-xs text-slate-500">
                Monitoring timeline pergerakan pengiriman, status checkpoint rute tol, dan estimasi tiba di DC nasional
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-xs"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Armada Di Jalan (In Transit)</span>
            <Truck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {fleetSummary.inTransit}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Sedang melintas rute antar kota
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Tiba di DC Menunggu Bongkar</span>
            <MapPin className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-indigo-700 font-mono">
            {fleetSummary.arrivedDc}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Antrian inbound gate DC
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Terkirim & Selesai (Delivered)</span>
            <CheckCircle2 className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {fleetSummary.deliveredToday}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Total penerimaan lengkap
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Kepatuhan SLA Pengiriman</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono flex items-baseline gap-1">
            <span>{fleetSummary.onTimeRate}%</span>
            <span className="text-xs font-normal text-slate-500">On-Time</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {fleetSummary.delayedCount > 0 ? (
              <span className="text-rose-600 font-semibold">{fleetSummary.delayedCount} armada mendekati/lewat SLA</span>
            ) : (
              'Seluruh rute sesuai jadwal'
            )}
          </div>
        </div>
      </div>

      {/* Quick Waybill / Resi Fast Lookup */}
      <div className="bg-linear-to-r from-slate-900 to-indigo-950 rounded-xl p-4 sm:p-5 text-white shadow-sm">
        <div className="max-w-2xl">
          <h3 className="text-sm font-bold tracking-tight mb-1">
            Pencarian Cepat No. Surat Jalan / Resi Ekspedisi
          </h3>
          <p className="text-xs text-slate-300 mb-3">
            Lacak kronologi posisi armada secara instan dengan memasukkan nomor SJ (contoh: <code>SJ-202609-0001</code>), nomor resi, atau plat kendaraan.
          </p>

          <form onSubmit={handleQuickWaybillSearch} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={waybillInput}
                onChange={(e) => setWaybillInput(e.target.value)}
                placeholder="Ketik SJ-..., No. Resi (DKT-..., JTR-...), atau No. Polisi..."
                className="w-full text-xs pl-8 pr-3 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-400 font-mono"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
            <button
              type="submit"
              disabled={searchingWaybill}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>{searchingWaybill ? 'Mencari...' : 'Lacak Langsung'}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari SJ, driver, DC tujuan, ekspedisi..."
              className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
          </div>

          {/* Customer Filter */}
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">Semua Customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.customer_name}
              </option>
            ))}
          </select>

          {/* DC Filter */}
          <select
            value={dcFilter}
            onChange={(e) => setDcFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 max-w-[200px]"
          >
            <option value="all">Semua DC</option>
            {dcs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.dc_name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">Semua Status Rute</option>
            <option value="IN_TRANSIT">In Transit (Di Jalan)</option>
            <option value="ARRIVED_DC">Arrived DC (Tiba di Gate)</option>
            <option value="READY_TO_DISPATCH">Ready to Dispatch (Siap Berangkat)</option>
            <option value="DELIVERED">Delivered (Telah Diterima)</option>
          </select>
        </div>

        <div className="text-xs text-slate-500">
          Menampilkan <strong>{filteredShipments.length}</strong> armada rute
        </div>
      </div>

      {/* Grid of Live Route Cards */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
          <span className="text-xs">Memuat armada dan live checkpoint...</span>
        </div>
      ) : filteredShipments.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Truck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-800 mb-1">
            Tidak Ada Pengiriman yang Sesuai Filter
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Coba ubah kata kunci pencarian atau reset filter customer dan status rute.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredShipments.map((s) => (
            <LiveRouteMapCard
              key={s.id}
              shipment={s}
              latestMilestone={latestMilestoneMap.get(s.id)}
              onOpenDetails={(ship) => {
                setSelectedShipment(ship);
                setIsDetailModalOpen(true);
              }}
              onAddCheckpoint={(ship) => {
                setShipmentForMilestone(ship);
                setIsAddMilestoneOpen(true);
              }}
              canEdit={canEditTracking}
            />
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <TrackingDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedShipment(null);
        }}
        shipment={selectedShipment}
        canEdit={canEditTracking}
        onOpenAddMilestone={(ship) => {
          setIsDetailModalOpen(false);
          setShipmentForMilestone(ship);
          setIsAddMilestoneOpen(true);
        }}
      />

      {/* Add Milestone Modal */}
      {shipmentForMilestone && (
        <AddMilestoneModal
          isOpen={isAddMilestoneOpen}
          onClose={() => {
            setIsAddMilestoneOpen(false);
            setShipmentForMilestone(null);
          }}
          shipmentId={shipmentForMilestone.id}
          shipmentNumber={shipmentForMilestone.shipment_number}
          onAdd={handleSaveMilestone}
        />
      )}
    </div>
  );
};
