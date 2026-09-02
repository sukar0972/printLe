package io.printle.job;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class JobStatePoller {
    private final JobService jobs;
    public JobStatePoller(JobService jobs) { this.jobs = jobs; }

    @Scheduled(fixedDelayString = "${printle.print-poll-interval-ms:1000}")
    public void poll() { jobs.syncActiveJobs(); }
}
