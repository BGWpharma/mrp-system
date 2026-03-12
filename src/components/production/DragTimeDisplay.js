import React from 'react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { calculateMaterialReservationStatus, getReservationStatusColors } from '../../utils/productionUtils';
import { getStatusMainColor } from '../../styles/colorConfig';

const DragTimeDisplay = React.memo(({ dragInfo, themeMode }) => {
  if (!dragInfo.isDragging || !dragInfo.startTime || !dragInfo.endTime) return null;

  const formatTime = (date) => {
    return format(date, 'dd.MM.yyyy HH:mm', { locale: pl });
  };

  const getDuration = () => {
    const diffMs = dragInfo.endTime.getTime() - dragInfo.startTime.getTime();
    const diffMinutes = Math.round(diffMs / (1000 * 60));
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
  };

  const style = {
    position: 'fixed',
    left: dragInfo.position.x + 15,
    top: dragInfo.position.y - 10,
    backgroundColor: themeMode === 'dark' ? '#2c3e50' : '#ffffff',
    color: themeMode === 'dark' ? '#ffffff' : 'rgba(0, 0, 0, 0.87)',
    border: themeMode === 'dark' ? '2px solid #3498db' : '2px solid #1976d2',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '0.875rem',
    lineHeight: '1.4',
    zIndex: 10001,
    pointerEvents: 'none',
    boxShadow: themeMode === 'dark' 
      ? '0px 4px 16px rgba(0, 0, 0, 0.3)' 
      : '0px 4px 16px rgba(0, 0, 0, 0.1)',
    fontFamily: 'Inter, Roboto, sans-serif'
  };

  return (
    <div style={style}>
      <div style={{ 
        fontWeight: 600, 
        fontSize: '0.9rem', 
        marginBottom: '8px',
        color: themeMode === 'dark' ? '#3498db' : '#1976d2'
      }}>
        📅 Nowy przedział czasowy
      </div>
      
      <div style={{ marginBottom: '4px' }}>
        <span style={{ fontWeight: 500 }}>Start: </span>
        <span>{formatTime(dragInfo.startTime)}</span>
      </div>
      
      <div style={{ marginBottom: '4px' }}>
        <span style={{ fontWeight: 500 }}>Koniec: </span>
        <span>{formatTime(dragInfo.endTime)}</span>
      </div>
      
      <div style={{ 
        marginTop: '8px', 
        paddingTop: '8px',
        borderTop: `1px solid ${themeMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
        fontSize: '0.8rem',
        color: themeMode === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)'
      }}>
        <span style={{ fontWeight: 500 }}>Czas trwania: </span>
        <span>{getDuration()}</span>
      </div>
    </div>
  );
});

const CustomTooltip = React.memo(({ task, position, visible, themeMode, workstations, t }) => {
  if (!visible || !task) return null;

  const getStatusText = (status) => {
    const statusMap = {
      'Zaplanowane': t('production.timeline.statuses.scheduled'),
      'W trakcie': t('production.timeline.statuses.inProgress'),
      'Zakończone': t('production.timeline.statuses.completed'),
      'Anulowane': t('production.timeline.statuses.cancelled'),
      'Wstrzymane': t('production.timeline.statuses.onHold')
    };
    return statusMap[status] || status;
  };

  const formatDate = (date) => {
    if (!date) return 'Nie ustawiono';
    const d = date instanceof Date ? date : 
             date.toDate ? date.toDate() : 
             new Date(date);
    return format(d, 'dd.MM.yyyy HH:mm', { locale: pl });
  };

  const getWorkstationName = () => {
    if (!task.workstationId) return t('production.timeline.groups.noWorkstation');
    const workstation = workstations?.find(w => w.id === task.workstationId);
    if (workstation) return workstation.name;
    if (task.workstationName) return task.workstationName;
    return 'Nieznane stanowisko';
  };

  const getCustomerName = () => {
    const customerId = task.customer?.id || task.customerId;
    if (!customerId) return 'Bez klienta';
    const customer = task.customer || (task.customerName ? { name: task.customerName } : null);
    return customer?.name || task.customerName || 'Nieznany klient';
  };

  const getDuration = () => {
    if (task.estimatedDuration) {
      const hours = Math.floor(task.estimatedDuration / 60);
      const minutes = task.estimatedDuration % 60;
      return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
    }
    if (task.scheduledDate && task.endDate) {
      const start = task.scheduledDate instanceof Date ? task.scheduledDate : 
                   task.scheduledDate.toDate ? task.scheduledDate.toDate() : 
                   new Date(task.scheduledDate);
      const end = task.endDate instanceof Date ? task.endDate : 
                 task.endDate.toDate ? task.endDate.toDate() : 
                 new Date(task.endDate);
      const diffMs = end.getTime() - start.getTime();
      const diffMinutes = Math.round(diffMs / (1000 * 60));
      const hours = Math.floor(diffMinutes / 60);
      const minutes = diffMinutes % 60;
      return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
    }
    return 'Nie określono';
  };

  const tooltipStyle = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    backgroundColor: themeMode === 'dark' ? '#1e293b' : '#ffffff',
    color: themeMode === 'dark' ? '#ffffff' : 'rgba(0, 0, 0, 0.87)',
    border: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
    borderRadius: '8px',
    padding: '12px',
    boxShadow: themeMode === 'dark' 
      ? '0px 4px 16px rgba(0, 0, 0, 0.3)' 
      : '0px 4px 16px rgba(0, 0, 0, 0.1)',
    fontSize: '0.875rem',
    lineHeight: '1.4',
    maxWidth: '320px',
    minWidth: '240px',
    zIndex: 10000,
    pointerEvents: 'none'
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Zaplanowane': return '#6366f1';
      case 'W trakcie':   return '#f59e0b';
      case 'Zakończone':  return '#10b981';
      case 'Anulowane':   return '#ef4444';
      case 'Wstrzymane':  return '#64748b';
      default:            return getStatusMainColor(status);
    }
  };

  const statusColor = getStatusColor(task.status);
  const labelColor = themeMode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)';

  return (
    <div style={tooltipStyle}>
      <div style={{ 
        fontWeight: 600, 
        fontSize: '0.95rem', 
        marginBottom: '8px',
        color: themeMode === 'dark' ? '#ffffff' : 'rgba(0, 0, 0, 0.9)'
      }}>
        {task.name || task.productName}
      </div>

      <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'center' }}>
        <span style={{ marginRight: '8px', color: labelColor }}>
          {t('production.timeline.tooltip.status')}:
        </span>
        <span style={{ 
          color: statusColor, 
          fontWeight: 500,
          backgroundColor: `${statusColor}20`,
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '0.8rem'
        }}>
          {getStatusText(task.status)}
        </span>
      </div>

      {task.moNumber && (
        <div style={{ marginBottom: '6px' }}>
          <span style={{ color: labelColor }}>
            {t('production.timeline.tooltip.moNumber')}: 
          </span>
          <span style={{ marginLeft: '8px', fontWeight: 500 }}>
            {task.moNumber}
          </span>
        </div>
      )}

      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: labelColor }}>
          {t('production.timeline.tooltip.quantity')}: 
        </span>
        <span style={{ marginLeft: '8px', fontWeight: 500 }}>
          {task.quantity} {task.unit || 'szt.'}
        </span>
      </div>

      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: labelColor }}>
          {t('production.timeline.tooltip.workstation')}: 
        </span>
        <span style={{ marginLeft: '8px', fontWeight: 500 }}>
          {getWorkstationName()}
        </span>
      </div>

      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: labelColor }}>
          {t('production.timeline.tooltip.customer')}: 
        </span>
        <span style={{ marginLeft: '8px', fontWeight: 500 }}>
          {getCustomerName()}
        </span>
      </div>

      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: labelColor }}>
          {t('production.timeline.tooltip.duration')}: 
        </span>
        <span style={{ marginLeft: '8px', fontWeight: 500 }}>
          {getDuration()}
        </span>
      </div>

      {(() => {
        const reservationStatus = calculateMaterialReservationStatus(task);
        if (reservationStatus.status !== 'no_materials' && reservationStatus.status !== 'completed_confirmed') {
          const statusColors = getReservationStatusColors(reservationStatus.status);
          return (
            <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'center' }}>
              <span style={{ marginRight: '8px', color: labelColor }}>
                {t('production.timeline.tooltip.materials')}:
              </span>
              <span style={{ 
                color: statusColors.main, 
                fontWeight: 500,
                backgroundColor: `${statusColors.main}20`,
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '0.8rem'
              }}>
                {reservationStatus.label}
              </span>
            </div>
          );
        }
        return null;
      })()}

      {(() => {
        const poInfo = task.poDeliveryInfo;
        if (!poInfo || poInfo.length === 0) return null;
        if (task.status === 'Zakończone' || task.status === 'completed') return null;

        const scheduledDate = task.scheduledDate instanceof Date
          ? task.scheduledDate
          : task.scheduledDate?.toDate?.()
            ? task.scheduledDate.toDate()
            : new Date(task.scheduledDate);
        const scheduledValid = !isNaN(scheduledDate.getTime());

        const items = poInfo.map((info, idx) => {
          const isDelivered = info.status === 'delivered' || info.status === 'converted';
          let deliveryDate = null;
          let isLate = false;
          let delayDays = null;
          let dateLabel = t('production.timeline.tooltip.poDeliveryNoDate');

          if (info.expectedDeliveryDate) {
            deliveryDate = info.expectedDeliveryDate instanceof Date
              ? info.expectedDeliveryDate
              : info.expectedDeliveryDate?.toDate?.()
                ? info.expectedDeliveryDate.toDate()
                : new Date(info.expectedDeliveryDate);
            
            if (!isNaN(deliveryDate.getTime())) {
              dateLabel = format(deliveryDate, 'dd.MM.yyyy', { locale: pl });
              if (scheduledValid && !isDelivered && deliveryDate > scheduledDate) {
                isLate = true;
                delayDays = Math.ceil((deliveryDate.getTime() - scheduledDate.getTime()) / (1000 * 60 * 60 * 24));
              }
            } else {
              dateLabel = t('production.timeline.tooltip.poDeliveryInvalidDate');
            }
          }

          let dotColor = '#4caf50';
          if (isDelivered) dotColor = '#2196f3';
          else if (isLate) dotColor = '#ff1744';
          else if (!info.expectedDeliveryDate) dotColor = '#9e9e9e';

          return { ...info, idx, isDelivered, isLate, delayDays, dateLabel, dotColor };
        });

        const delayedCount = items.filter(i => i.isLate).length;

        return (
          <div style={{ 
            marginBottom: '6px',
            borderTop: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.06)',
            paddingTop: '6px'
          }}>
            <div style={{ 
              marginBottom: '4px', 
              display: 'flex', 
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span style={{ color: labelColor }}>
                {t('production.timeline.tooltip.poDeliveryEta')}:
              </span>
              {delayedCount > 0 && (
                <span style={{
                  color: '#ff1744',
                  fontWeight: 500,
                  backgroundColor: 'rgba(255, 23, 68, 0.12)',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  fontSize: '0.75rem'
                }}>
                  {t('production.timeline.tooltip.poDeliveryDelayed', { count: delayedCount })}
                </span>
              )}
            </div>
            {items.slice(0, 5).map((item) => (
              <div key={item.idx} style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '3px',
                fontSize: '0.8rem'
              }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  minWidth: '6px',
                  backgroundColor: item.dotColor,
                  borderRadius: '50%',
                  display: 'inline-block',
                  flexShrink: 0
                }} />
                <span style={{ 
                  flex: 1, 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap',
                  color: labelColor
                }}>
                  {item.materialName || t('production.timeline.tooltip.poDeliveryUnknownMaterial')}
                </span>
                <span style={{ 
                  flexShrink: 0,
                  fontWeight: 500,
                  color: item.isDelivered 
                    ? '#2196f3'
                    : item.isLate 
                      ? '#ff1744' 
                      : (themeMode === 'dark' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.7)')
                }}>
                  {item.isDelivered ? t('production.timeline.tooltip.poDeliveryDelivered') : item.dateLabel}
                  {item.isLate && item.delayDays ? ` (+${item.delayDays}d)` : ''}
                </span>
              </div>
            ))}
            {items.length > 5 && (
              <div style={{ 
                color: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.35)',
                fontSize: '0.8rem',
                fontStyle: 'italic'
              }}>
                {t('production.timeline.tooltip.poDeliveryMore', { count: items.length - 5 })}
              </div>
            )}
          </div>
        );
      })()}

      <div style={{ 
        fontSize: '0.8rem',
        borderTop: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
        paddingTop: '8px',
        color: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ marginBottom: '4px' }}>
          <strong>{task.actualStartDate ? t('production.timeline.tooltip.actualStartDate') + ':' : t('production.timeline.tooltip.scheduledDate') + ':'}</strong> {formatDate(task.actualStartDate || task.scheduledDate)}
        </div>
        <div>
          <strong>{task.actualEndDate ? t('production.timeline.tooltip.actualEndDate') + ':' : t('production.timeline.tooltip.endDate') + ':'}</strong> {formatDate(task.actualEndDate || task.endDate)}
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.visible === nextProps.visible &&
    prevProps.themeMode === nextProps.themeMode &&
    prevProps.position.x === nextProps.position.x &&
    prevProps.position.y === nextProps.position.y &&
    prevProps.task?.id === nextProps.task?.id
  );
});

const PODeliveryTooltip = React.memo(({ reservation, position, visible, themeMode, t }) => {
  if (!visible || !reservation) return null;

  const res = reservation;
  const isDelivered = res.status === 'delivered' || res.status === 'converted';
  const isPending = res.status === 'pending';

  const formatDate = (date) => {
    if (!date) return '-';
    const d = date instanceof Date ? date : date?.toDate ? date.toDate() : new Date(date);
    if (isNaN(d.getTime())) return '-';
    return format(d, 'dd.MM.yyyy', { locale: pl });
  };

  const isConverted = res.status === 'converted';
  const statusColor = isDelivered ? '#4caf50' : isPending ? '#ff9800' : '#9e9e9e';
  const statusLabel = isConverted
    ? t('production.timeline.poTooltip.statusConverted')
    : isDelivered
      ? t('production.timeline.poTooltip.statusDelivered')
      : isPending
        ? t('production.timeline.poTooltip.statusPending')
        : res.status;

  const labelColor = themeMode === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';

  return (
    <div style={{
      position: 'fixed',
      left: position.x,
      top: position.y,
      backgroundColor: themeMode === 'dark' ? '#1e293b' : '#ffffff',
      color: themeMode === 'dark' ? '#ffffff' : 'rgba(0, 0, 0, 0.87)',
      border: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
      borderRadius: '8px',
      padding: '12px',
      boxShadow: themeMode === 'dark'
        ? '0px 4px 16px rgba(0, 0, 0, 0.3)'
        : '0px 4px 16px rgba(0, 0, 0, 0.1)',
      fontSize: '0.875rem',
      lineHeight: '1.4',
      maxWidth: '320px',
      minWidth: '220px',
      zIndex: 10000,
      pointerEvents: 'none'
    }}>
      <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '8px' }}>
        {res.materialName}
      </div>

      <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'center' }}>
        <span style={{ color: labelColor, marginRight: 8 }}>
          {t('production.timeline.poTooltip.status')}:
        </span>
        <span style={{
          color: statusColor,
          fontWeight: 500,
          backgroundColor: `${statusColor}20`,
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '0.8rem'
        }}>
          {statusLabel}
        </span>
      </div>

      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: labelColor }}>
          {t('production.timeline.poTooltip.po')}:
        </span>
        <span style={{ marginLeft: 8, fontWeight: 500 }}>{res.poNumber}</span>
      </div>

      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: labelColor }}>
          {t('production.timeline.poTooltip.quantity')}:
        </span>
        <span style={{ marginLeft: 8, fontWeight: 500 }}>
          {res.reservedQuantity} {res.unit}
          {isDelivered && res.deliveredQuantity != null && ` (${t('production.timeline.poTooltip.quantityDelivered', { quantity: res.deliveredQuantity, unit: res.unit })})`}
        </span>
      </div>

      {res.supplier?.name && (
        <div style={{ marginBottom: '6px' }}>
          <span style={{ color: labelColor }}>
            {t('production.timeline.poTooltip.supplier')}:
          </span>
          <span style={{ marginLeft: 8, fontWeight: 500 }}>{res.supplier.name}</span>
        </div>
      )}

      <div style={{
        fontSize: '0.8rem',
        borderTop: themeMode === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
        paddingTop: '8px',
        color: themeMode === 'dark' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'
      }}>
        <div style={{ marginBottom: '4px' }}>
          <strong>{t('production.timeline.poTooltip.plannedDelivery')}:</strong> {formatDate(res.expectedDeliveryDate)}
        </div>
        {isDelivered && res.deliveredAt && (
          <div>
            <strong>{t('production.timeline.poTooltip.deliveredAt')}:</strong> {formatDate(res.deliveredAt)}
          </div>
        )}
        {res.linkedBatches?.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <strong>{t('production.timeline.poTooltip.batches')}:</strong> {res.linkedBatches.map(b => b.batchNumber).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.visible === nextProps.visible &&
    prevProps.themeMode === nextProps.themeMode &&
    prevProps.position.x === nextProps.position.x &&
    prevProps.position.y === nextProps.position.y &&
    prevProps.reservation?.id === nextProps.reservation?.id
  );
});

export { DragTimeDisplay, CustomTooltip, PODeliveryTooltip };
export default DragTimeDisplay;
