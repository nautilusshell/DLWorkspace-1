import React, {
  ChangeEvent,
  FunctionComponent,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  each,
  filter,
  map,
  mapValues
} from 'lodash';
import {
  Card,
  CardMedia,
  Link,
  MenuItem,
  Select,
  Tooltip,
  Typography
} from '@material-ui/core';
import {
  Favorite
} from '@material-ui/icons';
import MaterialTable, {
  Column,
  Options,
  DetailPanel
} from 'material-table';

import TeamsContext from '../../contexts/Teams';
import useTableData from '../../hooks/useTableData';
import usePrometheus from '../../hooks/usePrometheus';

import useResourceColumns, { ResourceKind } from '../Clusters/useResourceColumns';

interface Props {
  data: any;
  onSearchPods: (query: string) => void;
}

const Workers: FunctionComponent<Props> = ({ data: { config, types, workers }, onSearchPods }) => {
  const { selectedTeam } = useContext(TeamsContext);

  const [filterType, setFilterType] = useState<string>('__all__');

  const metrics = usePrometheus(config['grafana'], `avg(task_gpu_percent{vc_name="${selectedTeam}"}) by (instance)`);
  const workersGPUUtilization = useMemo(() => {
    const workersGPUUtilization: { [workerName: string]: number } = Object.create(null);
    if (metrics) {
      for (const { metric, value } of metrics.result) {
        const instanceIP = metric.instance.split(':', 1)[0];
        workersGPUUtilization[instanceIP] = value[1];
      }
    }
    return workersGPUUtilization;
  }, [metrics]);

  const data = useMemo(() => {
    let workersData = map(workers, (worker, id) => ({ id, ...worker }));
    if (filterType !== '__all__') {
      workersData = filter(workersData, ({ type }) => type === filterType);
    }
    each(workersData, (workerData) => {
      workerData.status = mapValues(workerData.status, (value) => {
        return {
          ...value,
          unschedulable: (value.total || 0) - (value.allocatable || 0),
          available: (value.allocatable || 0) - (value.used || 0)
        }
      });
      workerData.gpuUtilization = workersGPUUtilization[workerData.ip];
    })
    return workersData
  }, [workers, workersGPUUtilization, filterType]);
  const tableData = useTableData(data, { isTreeExpanded: true });

  const handleWorkerClick = useCallback((workerName: string) => () => {
    onSearchPods(workerName);
  }, [onSearchPods]);

  const resourceKinds = useRef<ResourceKind[]>(
    ['total', 'unschedulable', 'used', 'preemptable', 'available']
  ).current;
  const resourceColumns = useResourceColumns(resourceKinds);
  const columns = useMemo(() => {
    const columns: Column<any>[] = [{
      field: 'id',
      render: ({ id, healthy }) => {
        if (typeof healthy === 'boolean') {
          return (
            <Tooltip title={`Show Pods on ${id}`}>
              <Link
                component="button"
                variant="subtitle2"
                style={{ textAlign: 'left' }}
                onClick={handleWorkerClick(id)}
              >
                <>
                  { healthy || <Favorite color="error" fontSize="inherit"/> }
                  {id}
                </>
              </Link>
            </Tooltip>
          );
        } else {
          return <Typography variant="subtitle2">{id}</Typography>;
        }
      }
    }];
    columns.push(...resourceColumns);
    columns.push({
      title: 'GPU Utilization',
      field: 'gpuUtilization',
      type: 'numeric',
      render: ({ gpuUtilization }) => gpuUtilization && <>{Number(gpuUtilization).toPrecision(2)}%</>
    });
    return columns;
  }, [resourceColumns, handleWorkerClick]);

  const options = useRef<Options>({
    padding: 'dense',
    draggable: false,
    paging: false,
    detailPanelType: 'single'
  }).current;

  const handleSelectChange = useCallback((event: ChangeEvent<{ value: unknown }>) => {
    setFilterType(event.target.value as string);
  }, []);

  const detailPanel = useMemo<DetailPanel<any>[]>(() => {
    return [{
      tooltip: 'View Metrics',
      render: ({ ip }) => (
        <Card>
          <CardMedia
            component="iframe"
            src={`${config['grafana']}/dashboard/db/node-status?orgId=1&var-node=${ip}`}
            height="384"
            frameBorder="0"
          />
        </Card>
      )
    }];
  }, [config]);

  return (
    <MaterialTable
      title={(
        <>
          Show Type: <Select value={filterType} onChange={handleSelectChange}>
            <MenuItem value="__all__">All</MenuItem>
            {map(types, (type, name) => (
              <MenuItem key={name} value={name}>{name}</MenuItem>
            ))}
          </Select>
        </>
      )}
      data={tableData}
      columns={columns}
      options={options}
      detailPanel={detailPanel}
    />
  );
};

export default Workers;