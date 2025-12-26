use tokio::sync::Semaphore;
use std::sync::Arc;
use futures::future::join_all;

/// Async worker pool for concurrent data fetching
pub struct WorkerPool {
    semaphore: Arc<Semaphore>,
    max_concurrent: usize,
}

impl WorkerPool {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(max_concurrent)),
            max_concurrent,
        }
    }

    /// Execute multiple async tasks with concurrency control
    pub async fn execute_batch<F, T>(&self, tasks: Vec<F>) -> Vec<Result<T, String>>
    where
        F: std::future::Future<Output = Result<T, String>> + Send + 'static,
        T: Send + 'static,
    {
        let handles: Vec<_> = tasks
            .into_iter()
            .map(|task| {
                let permit = Arc::clone(&self.semaphore);
                tokio::spawn(async move {
                    let _guard = permit.acquire().await.unwrap();
                    task.await
                })
            })
            .collect();

        let results = join_all(handles).await;
        
        results
            .into_iter()
            .map(|r| r.unwrap_or_else(|e| Err(format!("Task panicked: {}", e))))
            .collect()
    }

    /// Execute tasks with rate limiting (delay between tasks)
    pub async fn execute_with_rate_limit<F, T>(
        &self,
        tasks: Vec<F>,
        delay_ms: u64,
    ) -> Vec<Result<T, String>>
    where
        F: std::future::Future<Output = Result<T, String>> + Send + 'static,
        T: Send + 'static,
    {
        let mut results = Vec::new();
        
        for task in tasks {
            let permit = Arc::clone(&self.semaphore);
            let handle = tokio::spawn(async move {
                let _guard = permit.acquire().await.unwrap();
                task.await
            });
            
            results.push(handle);
            
            // Rate limiting delay
            tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
        }

        let completed = join_all(results).await;
        
        completed
            .into_iter()
            .map(|r| r.unwrap_or_else(|e| Err(format!("Task panicked: {}", e))))
            .collect()
    }

    pub fn max_concurrent(&self) -> usize {
        self.max_concurrent
    }
}

/// Task priority queue for prioritizing important requests
pub struct PriorityWorkerPool {
    high_priority: WorkerPool,
    normal_priority: WorkerPool,
}

impl PriorityWorkerPool {
    pub fn new(high_priority_workers: usize, normal_priority_workers: usize) -> Self {
        Self {
            high_priority: WorkerPool::new(high_priority_workers),
            normal_priority: WorkerPool::new(normal_priority_workers),
        }
    }

    pub async fn execute_high_priority<F, T>(&self, tasks: Vec<F>) -> Vec<Result<T, String>>
    where
        F: std::future::Future<Output = Result<T, String>> + Send + 'static,
        T: Send + 'static,
    {
        self.high_priority.execute_batch(tasks).await
    }

    pub async fn execute_normal_priority<F, T>(&self, tasks: Vec<F>) -> Vec<Result<T, String>>
    where
        F: std::future::Future<Output = Result<T, String>> + Send + 'static,
        T: Send + 'static,
    {
        self.normal_priority.execute_batch(tasks).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_worker_pool_concurrency() {
        let pool = WorkerPool::new(3);
        
        let tasks = vec![
            async { Ok::<_, String>(1) },
            async { Ok::<_, String>(2) },
            async { Ok::<_, String>(3) },
            async { Ok::<_, String>(4) },
            async { Ok::<_, String>(5) },
        ];

        let results = pool.execute_batch(tasks).await;
        assert_eq!(results.len(), 5);
        assert!(results.iter().all(|r| r.is_ok()));
    }
}
